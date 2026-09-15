import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import {
    safeReadJson,
    safeWriteJson,
    readCollection,
    getItem,
    saveItem,
    deleteItem,
    setSimulateReadOnly,
    resetMemoryStoreForTesting,
    parseFirebaseCredentials,
    SERVERLESS_TMP_DIR,
    PRIMARY_DATA_DIR
} from "../server/storage/storage-adapter.js";

import {
    saveIncident,
    getIncidentById,
    readAllIncidents
} from "../server/services/incident-service.js";

import {
    saveMission,
    getMissionById,
    readAllMissions
} from "../server/services/mission-service.js";

import {
    saveSyncOperationRecord,
    getSyncOperationById
} from "../server/services/sync-service.js";

test.beforeEach(() => {
    resetMemoryStoreForTesting();
});

test.afterEach(() => {
    resetMemoryStoreForTesting();
});

test("Serverless Persistence: safeWriteJson diverts to /tmp when read-only mode is active without throwing EROFS", () => {
    setSimulateReadOnly(true);

    const testPayload = [{ id: "TEST-01", status: "VERIFIED", timestamp: Date.now() }];
    const testFile = `serverless-test-${Date.now()}.json`;

    const writeSuccess = safeWriteJson(testFile, testPayload);
    assert.equal(writeSuccess, true, "safeWriteJson should succeed in serverless mode");

    // Verify it was written to /tmp fallback directory
    const tmpFilePath = path.join(SERVERLESS_TMP_DIR, testFile);
    assert.equal(fs.existsSync(tmpFilePath), true, "File should exist in serverless tmp directory");

    // Verify read retrieves exact content
    const readPayload = safeReadJson(testFile, []);
    assert.deepEqual(readPayload, testPayload, "Read content should match written content");

    // Clean up tmp file
    try { fs.unlinkSync(tmpFilePath); } catch {}
});

test("Serverless Persistence: readCollection falls back gracefully from memory to tmp to primary seed", async () => {
    setSimulateReadOnly(true);

    // Read incidents which exists in bundled primary data dir
    const incidents = await readCollection("incidents", []);
    assert.ok(Array.isArray(incidents), "Should return an array");
    assert.ok(incidents.length > 0, "Should contain seeded incidents from primary data");

    // Mutate an incident in serverless mode
    const testIncident = {
        incidentId: "INC-TEST-SERVERLESS",
        title: "Test Flood Breach Under Serverless",
        priority: "P1",
        status: "ACTIVE",
        createdAt: Date.now()
    };
    await saveItem("incidents", testIncident.incidentId, testIncident);

    // Verify item is retrievable
    const retrieved = await getItem("incidents", testIncident.incidentId);
    assert.ok(retrieved, "Incident should be found in serverless store");
    assert.equal(retrieved.title, "Test Flood Breach Under Serverless");

    // Clean up
    await deleteItem("incidents", testIncident.incidentId);
});

test("Firebase Credential Parsing: Handles escaped newlines in private keys and Base64 strings safely", () => {
    const originalJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    const originalFile = process.env.FIREBASE_SERVICE_ACCOUNT_FILE;

    try {
        // 1. Raw JSON with escaped newlines
        const fakeCredentials = {
            project_id: "test-chronicai-prod",
            client_email: "test@chronicai-prod.iam.gserviceaccount.com",
            private_key: "-----BEGIN PRIVATE KEY-----\\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASC\\n-----END PRIVATE KEY-----\\n"
        };
        process.env.FIREBASE_SERVICE_ACCOUNT_FILE = "";
        process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify(fakeCredentials);

        const parsed = parseFirebaseCredentials();
        assert.ok(parsed, "Should successfully parse valid JSON credentials");
        assert.equal(parsed.project_id, "test-chronicai-prod");
        assert.ok(parsed.private_key.includes("\n"), "Escaped \\n should be replaced with real newlines");

        // 2. Base64 encoded JSON string
        const base64Encoded = Buffer.from(JSON.stringify(fakeCredentials)).toString("base64");
        process.env.FIREBASE_SERVICE_ACCOUNT_JSON = base64Encoded;

        const parsedFromBase64 = parseFirebaseCredentials();
        assert.ok(parsedFromBase64, "Should successfully decode and parse base64 credentials");
        assert.equal(parsedFromBase64.project_id, "test-chronicai-prod");

        // 3. Non-existent file path should not crash with ENOENT
        process.env.FIREBASE_SERVICE_ACCOUNT_FILE = "/non/existent/path/to/creds.json";
        process.env.FIREBASE_SERVICE_ACCOUNT_JSON = "";
        const parsedMissingFile = parseFirebaseCredentials();
        assert.equal(parsedMissingFile, null, "Should return null safely for missing file without throwing ENOENT");
    } finally {
        process.env.FIREBASE_SERVICE_ACCOUNT_JSON = originalJson;
        process.env.FIREBASE_SERVICE_ACCOUNT_FILE = originalFile;
    }
});

test("Incident & Mission Services: Operations succeed seamlessly in simulated serverless read-only mode", async () => {
    setSimulateReadOnly(true);

    // Save Incident via service
    const incidentPayload = {
        incidentId: "INC-SRV-001",
        publicId: "PUB-SRV-001",
        title: "Serverless Resilience Incident",
        description: "Testing serverless container zero-loss persistence",
        status: "REPORTED",
        priority: "P2"
    };
    const savedIncident = await saveIncident(incidentPayload);
    assert.equal(savedIncident.incidentId, "INC-SRV-001");

    const fetchedIncident = await getIncidentById("INC-SRV-001");
    assert.ok(fetchedIncident, "Incident should be retrievable");
    assert.equal(fetchedIncident.title, "Serverless Resilience Incident");

    // Save Mission via service
    const missionPayload = {
        id: "MSN-SRV-001",
        incidentId: "INC-SRV-001",
        resourceId: "ambulance_a12",
        status: "ASSIGNED",
        assignedTo: "field_worker_test"
    };
    const savedMission = await saveMission(missionPayload);
    assert.equal(savedMission.id, "MSN-SRV-001");

    const fetchedMission = await getMissionById("MSN-SRV-001");
    assert.ok(fetchedMission, "Mission should be retrievable");
    assert.equal(fetchedMission.assignedTo, "field_worker_test");

    // Save Sync Operation via service
    const syncOpPayload = {
        id: "SYNC-SRV-001",
        type: "UPDATE_MISSION_STATUS",
        status: "APPLIED",
        missionId: "MSN-SRV-001"
    };
    const savedSyncOp = await saveSyncOperationRecord(syncOpPayload);
    assert.equal(savedSyncOp.id, "SYNC-SRV-001");

    const fetchedSyncOp = await getSyncOperationById("SYNC-SRV-001");
    assert.ok(fetchedSyncOp, "Sync operation should be retrievable");
    assert.equal(fetchedSyncOp.missionId, "MSN-SRV-001");
});
