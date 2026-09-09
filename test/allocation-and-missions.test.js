// ============================================================
// CHRONICAI RESPONSE NETWORK — PHASE 2 OPERATIONS TEST SUITE
// Unit & Integration tests for Resource recommendations & Mission dispatch
// ============================================================

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { app } from "../server/firebase.js";

import {
    ResourceType,
    ResourceStatus,
    MissionStatus,
    buildResource,
    buildMission,
    canTransitionMission
} from "../server/domain/operations.js";

import {
    evaluateResourceForIncident,
    recommendTopResources
} from "../server/services/allocation-service.js";

import {
    readAllResources,
    getResourceById,
    saveResource,
    createMission,
    updateMissionStatus,
    seedDefaultResources
} from "../server/services/mission-service.js";

import {
    saveIncident,
    getIncidentById
} from "../server/services/incident-service.js";
import { buildCanonicalIncident, PriorityTier, IncidentStatus } from "../server/domain/incident.js";

let server;
let baseUrl;

test.before(async () => {
    await seedDefaultResources();
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
// 1. OPERATIONS DOMAIN MODEL & TRANSITIONS
// ============================================================

test("Operations Domain: Mission lifecycle transitions allow valid path and block invalid exits", () => {
    assert.equal(canTransitionMission(MissionStatus.ASSIGNED, MissionStatus.EN_ROUTE), true);
    assert.equal(canTransitionMission(MissionStatus.EN_ROUTE, MissionStatus.ARRIVED), true);
    assert.equal(canTransitionMission(MissionStatus.ARRIVED, MissionStatus.IN_PROGRESS), true);
    assert.equal(canTransitionMission(MissionStatus.IN_PROGRESS, MissionStatus.COMPLETED), true);
    assert.equal(canTransitionMission(MissionStatus.ASSIGNED, MissionStatus.CANCELLED), true);

    // Invalid transitions
    assert.equal(canTransitionMission(MissionStatus.COMPLETED, MissionStatus.EN_ROUTE), false);
    assert.equal(canTransitionMission(MissionStatus.CANCELLED, MissionStatus.ARRIVED), false);
});

// ============================================================
// 2. TOP-3 RESOURCE ALLOCATION ENGINE
// ============================================================

test("Allocation Engine: Recommends top-3 matching resources for P1 flood rescue incident", () => {
    const incident = buildCanonicalIncident({
        incidentId: "INC-TEST-ALLOC-1",
        title: "Flood rescue near Ward 7 school",
        category: "FLOOD_RESCUE",
        priority: PriorityTier.P1,
        priorityScore: { totalScore: 92, tier: "P1" },
        location: { latitude: 22.5726, longitude: 88.3639, text: "Ward 7 School" },
        aiAnalysis: {
            peopleAtRisk: 4,
            injuredPeople: 1,
            urgencySignals: ["trapped", "water rising"],
            hazards: ["flood"],
            recommendedResources: ["AMBULANCE", "BOAT"]
        }
    });

    const resources = [
        buildResource({
            id: "ambulance_a12",
            name: "Ambulance A-12",
            type: ResourceType.AMBULANCE,
            capabilities: ["OXYGEN", "FIRST_AID", "PATIENT_TRANSPORT"],
            capacity: 4,
            location: { latitude: 22.5710, longitude: 88.3620 } // ~200m away
        }),
        buildResource({
            id: "boat_b02",
            name: "Rescue Boat B-02",
            type: ResourceType.BOAT,
            capabilities: ["WATER_RESCUE", "PATIENT_TRANSPORT"],
            capacity: 6,
            location: { latitude: 22.5750, longitude: 88.3610 } // ~300m away
        }),
        buildResource({
            id: "rescue_r04",
            name: "Rescue Team R-04",
            type: ResourceType.RESCUE_TEAM,
            capabilities: ["WATER_RESCUE", "SEARCH_AND_RESCUE"],
            capacity: 8,
            location: { latitude: 22.5800, longitude: 88.3700 }
        }),
        buildResource({
            id: "truck_broken",
            name: "Broken Transport",
            type: ResourceType.SUPPLY,
            status: ResourceStatus.MAINTENANCE,
            location: { latitude: 22.5726, longitude: 88.3639 }
        })
    ];

    const recommendations = recommendTopResources(incident, resources, 3);

    assert.equal(recommendations.length, 3);
    assert.ok(recommendations[0].score > 0);
    assert.ok(recommendations[0].etaMinutes > 0);
    assert.ok(recommendations[0].reasons.length > 0);

    // Resource under maintenance must be strictly excluded
    assert.ok(!recommendations.some(r => r.resourceId === "truck_broken"));
});

// ============================================================
// 3. MISSION DISPATCH & STATUS LIFECYCLE
// ============================================================

test("Mission Service: Dispatching a mission updates resource to DISPATCHED and incident to ASSIGNED", async () => {
    const incident = buildCanonicalIncident({
        incidentId: "INC-TEST-MSN-1",
        title: "Elderly trapped in water",
        status: IncidentStatus.PRIORITIZED
    });
    await saveIncident(incident);

    const resource = buildResource({
        id: "amb_test_disp",
        name: "Ambulance Test Unit",
        type: ResourceType.AMBULANCE,
        status: ResourceStatus.AVAILABLE
    });
    await saveResource(resource);

    const { mission, resource: updatedRes, incident: updatedInc } = await createMission({
        incidentId: incident.incidentId,
        resourceId: resource.id,
        assignedTo: "worker_77",
        etaMinutes: 8,
        routeRisk: "LOW",
        notes: "Proceed via Sector 2 bridge",
        actor: { id: "officer_12", role: "government_officer", name: "Officer Sharma" }
    });

    assert.ok(mission.id.startsWith("MSN-"));
    assert.equal(mission.status, MissionStatus.ASSIGNED);
    assert.equal(updatedRes.status, ResourceStatus.DISPATCHED);
    assert.equal(updatedInc.status, IncidentStatus.ASSIGNED);
    assert.ok(updatedInc.assignedResourceIds.includes(resource.id));

    // Verify incident audit event
    const lastEvent = updatedInc.events[updatedInc.events.length - 1];
    assert.equal(lastEvent.type, "MISSION_ASSIGNED");
    assert.equal(lastEvent.payload.missionId, mission.id);

    // 4. Progress Mission: ARRIVED -> IN_PROGRESS
    const arrivedResult = await updateMissionStatus({
        missionId: mission.id,
        nextStatus: MissionStatus.ARRIVED,
        notes: "Arrived at primary school perimeter",
        actor: { id: "worker_77", role: "field_worker", name: "Responder Unit" }
    });
    assert.equal(arrivedResult.mission.status, MissionStatus.ARRIVED);
    assert.equal(arrivedResult.incident.status, IncidentStatus.IN_PROGRESS);

    // 5. Complete Mission -> Resource released back to AVAILABLE, Incident RESOLVED
    const completeResult = await updateMissionStatus({
        missionId: mission.id,
        nextStatus: MissionStatus.COMPLETED,
        notes: "All 4 elderly victims safely evacuated to shelter",
        actor: { id: "worker_77", role: "field_worker", name: "Responder Unit" }
    });
    assert.equal(completeResult.mission.status, MissionStatus.COMPLETED);
    assert.equal(completeResult.resource.status, ResourceStatus.AVAILABLE);
    assert.equal(completeResult.incident.status, IncidentStatus.RESOLVED);
});

// ============================================================
// 4. REST API INTEGRATION TESTS
// ============================================================

test("API: GET /api/resources returns registered response fleet", async () => {
    const res = await fetch(`${baseUrl}/api/resources`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.total >= 4);
    assert.ok(data.resources.some(r => r.name.includes("Ambulance")));
});

test("API: GET /api/resources/recommend/:incidentId returns top-3 scored recommendations", async () => {
    const incRes = await fetch(`${baseUrl}/api/incidents`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Local-Admin": "true" },
        body: JSON.stringify({
            title: "Flash flood trapped citizens",
            description: "Six residents trapped on second story in Ward 7.",
            category: "FLOOD_RESCUE",
            location: { latitude: 22.5730, longitude: 88.3640, text: "Ward 7 Primary" }
        })
    });
    const { incidentId } = await incRes.json();

    const recRes = await fetch(`${baseUrl}/api/resources/recommend/${incidentId}`);
    assert.equal(recRes.status, 200);
    const recData = await recRes.json();
    assert.equal(recData.success, true);
    assert.ok(recData.recommendations.length > 0 && recData.recommendations.length <= 3);
    assert.ok(recData.recommendations[0].score > 0);
    assert.ok(recData.recommendations[0].etaMinutes > 0);
});

test("API: POST /api/missions dispatches mission with idempotency and updates status", async () => {
    // 1. Create an incident
    const incRes = await fetch(`${baseUrl}/api/incidents`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Local-Admin": "true" },
        body: JSON.stringify({
            title: "Roof collapse requiring rescue team",
            description: "Partial roof collapse near community center.",
            category: "BUILDING_COLLAPSE",
            location: { latitude: 22.5700, longitude: 88.3600 }
        })
    });
    const { incidentId } = await incRes.json();

    // 2. Dispatch mission
    const idempotencyKey = `idemp-msn-${Date.now()}`;
    const dispatchRes = await fetch(`${baseUrl}/api/missions`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Local-Admin": "true",
            "Idempotency-Key": idempotencyKey
        },
        body: JSON.stringify({
            incidentId,
            resourceId: "rescue_r04",
            assignedTo: "field_alpha",
            etaMinutes: 6,
            routeRisk: "LOW",
            notes: "Deploy search dog and cutters"
        })
    });

    assert.equal(dispatchRes.status, 201);
    const dispatchData = await dispatchRes.json();
    assert.equal(dispatchData.success, true);
    const missionId = dispatchData.mission.id;

    // Test idempotency replay
    const replayRes = await fetch(`${baseUrl}/api/missions`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Local-Admin": "true",
            "Idempotency-Key": idempotencyKey
        },
        body: JSON.stringify({ incidentId, resourceId: "rescue_r04" })
    });
    assert.equal(replayRes.status, 201);
    const replayData = await replayRes.json();
    assert.equal(replayData.mission.id, missionId);

    // 3. Progress Mission via PATCH /api/missions/:id/status
    const updateRes = await fetch(`${baseUrl}/api/missions/${missionId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-Local-Admin": "true" },
        body: JSON.stringify({ status: "ARRIVED", notes: "Search team on scene." })
    });
    assert.equal(updateRes.status, 200);
    const updateData = await updateRes.json();
    assert.equal(updateData.mission.status, "ARRIVED");
    assert.equal(updateData.incident.status, "IN_PROGRESS");
});
