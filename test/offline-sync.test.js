// ============================================================
// CHRONICAI RESPONSE NETWORK — PHASE 3 OFFLINE SYNC TEST SUITE
// Unit & Integration tests for Sync queue, Idempotency, and Delta Pull
// ============================================================

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { app } from "../server/firebase.js";

import {
    SyncOperationType,
    SyncOperationStatus,
    buildSyncOperation,
    validateSyncOperation
} from "../server/domain/sync.js";

import {
    applySyncOperation,
    processSyncPushBatch,
    getSyncPullDelta,
    saveRoadClosure,
    readAllRoadClosures
} from "../server/services/sync-service.js";

import {
    saveIncident,
    getIncidentById
} from "../server/services/incident-service.js";
import {
    saveResource,
    createMission
} from "../server/services/mission-service.js";
import { buildResource } from "../server/domain/operations.js";
import { buildCanonicalIncident, PriorityTier, IncidentStatus } from "../server/domain/incident.js";

let server;
let baseUrl;

test.before(async () => {
    await new Promise((resolve) => {
        server = http.createServer(app);
        server.listen(0, "127.0.0.1", () => {
            const port = server.address().port;
            baseUrl = `http://127.0.0.1:${port}`;
            resolve();
        });
    });
});

test.after(async () => {
    if (server) {
        await new Promise((resolve) => server.close(resolve));
    }
});

// ============================================================
// 1. DOMAIN MODEL & VALIDATION TESTS
// ============================================================

test("Sync Domain: buildSyncOperation and validateSyncOperation enforce required fields", () => {
    // Valid operation
    const op = buildSyncOperation({
        id: "op_test_101",
        deviceId: "worker_tablet_9",
        type: SyncOperationType.RECORD_RESCUE,
        entityId: "INC-TEST-01",
        payload: { rescuedCount: 4 }
    });
    assert.equal(op.id, "op_test_101");
    assert.equal(op.type, SyncOperationType.RECORD_RESCUE);
    assert.equal(validateSyncOperation(op), null);

    // Invalid: missing type
    assert.throws(() => {
        buildSyncOperation({ type: "UNKNOWN_TYPE" });
    }, /Invalid sync operation type/);

    // Validation helper catches malformed objects
    assert.ok(validateSyncOperation({}) !== null);
    assert.ok(validateSyncOperation({ id: "123", type: "INVALID" }) !== null);
});

// ============================================================
// 2. IDEMPOTENT SYNC OPERATION APPLICATOR
// ============================================================

test("Sync Service: Idempotent mission update applies once and replays safely", async () => {
    // 1. Create incident and mission
    const incident = buildCanonicalIncident({
        incidentId: "INC-SYNC-001",
        title: "Flood rescue mission target",
        status: IncidentStatus.PRIORITIZED
    });
    await saveIncident(incident);

    const resource = buildResource({
        id: "res_sync_amb",
        name: "Sync Ambulance"
    });
    await saveResource(resource);

    const { mission } = await createMission({
        incidentId: incident.incidentId,
        resourceId: resource.id,
        assignedTo: "worker_sync_1"
    });

    const opId = `op_sync_${Date.now()}`;
    const syncOp = {
        id: opId,
        type: SyncOperationType.MISSION_STATUS_UPDATE,
        entityId: mission.id,
        payload: { status: "ARRIVED", notes: "First on scene via boat" }
    };

    // First apply: should be APPLIED
    const firstResult = await applySyncOperation(syncOp, { id: "worker_sync_1", role: "field_worker" });
    assert.equal(firstResult.status, SyncOperationStatus.APPLIED);
    assert.equal(firstResult.result.status, "ARRIVED");

    // Second apply: replay with identical operationId should be idempotent
    const secondResult = await applySyncOperation(syncOp, { id: "worker_sync_1", role: "field_worker" });
    assert.equal(secondResult.status, SyncOperationStatus.APPLIED);
    assert.equal(secondResult.replayed, true, "Duplicate operation ID must be safely replayed without duplicate execution.");
});

test("Sync Service: RECORD_RESCUE updates incident casualty count and appends audit event", async () => {
    const incident = buildCanonicalIncident({
        incidentId: "INC-SYNC-RESCUE-1",
        title: "Stranded school children rescue",
        status: IncidentStatus.IN_PROGRESS
    });
    await saveIncident(incident);

    const rescueOp = {
        id: `op_rescue_${Date.now()}`,
        type: SyncOperationType.RECORD_RESCUE,
        entityId: incident.incidentId,
        payload: { rescuedCount: 7, notes: "Transferred 7 children to evacuation raft" }
    };

    const res = await applySyncOperation(rescueOp, { id: "worker_raft", role: "field_worker", name: "Boat Crew 2" });
    assert.equal(res.status, SyncOperationStatus.APPLIED);
    assert.equal(res.result.totalRescued, 7);

    // Verify incident persisted state
    const updatedInc = await getIncidentById(incident.incidentId);
    assert.equal(updatedInc.rescuedPeople, 7);
    const lastEvent = updatedInc.events[updatedInc.events.length - 1];
    assert.equal(lastEvent.type, "OFFLINE_SYNC_APPLIED");
    assert.equal(lastEvent.payload.action, "RECORD_RESCUE");
    assert.equal(lastEvent.payload.rescuedCount, 7);
});

// ============================================================
// 3. REST API INTEGRATION TESTS: PUSH, PULL & ROAD CLOSURES
// ============================================================

test("API: POST /api/sync/push processes batch operations and returns detailed status", async () => {
    const incident = buildCanonicalIncident({
        incidentId: "INC-API-SYNC-1",
        title: "Water overflow blockage",
        status: IncidentStatus.IN_PROGRESS
    });
    await saveIncident(incident);

    const batch = [
        {
            id: `op_b1_${Date.now()}`,
            type: "RECORD_RESCUE",
            entityId: incident.incidentId,
            payload: { rescuedCount: 3 }
        },
        {
            id: `op_b2_${Date.now()}`,
            type: "REPORT_ROAD_CLOSURE",
            entityId: incident.incidentId,
            payload: {
                roadName: "Barrackpore Highway Km 14",
                latitude: 22.7500,
                longitude: 88.3500,
                reason: "Submerged under 1 meter of floodwater"
            }
        },
        {
            id: `op_b3_invalid_${Date.now()}`,
            type: "INVALID_MUTATION",
            payload: {}
        }
    ];

    const pushRes = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Worker-Id": "worker_field_9" },
        body: JSON.stringify({ operations: batch })
    });

    assert.equal(pushRes.status, 200);
    const pushData = await pushRes.json();
    assert.equal(pushData.success, true);
    assert.equal(pushData.applied, 2);
    assert.equal(pushData.rejected, 1);
    assert.equal(pushData.results.length, 3);
});

test("API: GET /api/sync/road-closures returns recorded field obstructions", async () => {
    const res = await fetch(`${baseUrl}/api/sync/road-closures`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.total >= 1);
    assert.ok(data.roadClosures.some(r => r.roadName.includes("Highway")));
});

test("API: GET /api/sync/pull returns delta updates since given timestamp", async () => {
    const pastTime = Date.now() - (60 * 60 * 1000); // 1 hour ago
    const res = await fetch(`${baseUrl}/api/sync/pull?sinceTimestamp=${pastTime}`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.serverTime > 0);
    assert.ok(Array.isArray(data.delta.incidents));
    assert.ok(Array.isArray(data.delta.missions));
    assert.ok(Array.isArray(data.delta.resources));
    assert.ok(Array.isArray(data.delta.roadClosures));
    assert.ok(data.delta.incidents.length >= 1);
});
