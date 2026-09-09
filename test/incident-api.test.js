// ============================================================
// CHRONICAI RESPONSE NETWORK — INCIDENT HTTP API INTEGRATION TESTS
// Tests for REST endpoints: list, get, create, verify, reject,
// duplicate-candidates, merge, and priority-score.
// ============================================================

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { app } from "../server/firebase.js";

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

test("API: POST /api/incidents creates a canonical incident with heuristic AI analysis and priority", async () => {
    const res = await fetch(`${baseUrl}/api/incidents`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Local-Admin": "true" },
        body: JSON.stringify({
            title: "Flood rescue near Ward 7 school",
            description: "Four elderly people are trapped on the ground floor with rising water.",
            category: "FLOOD_RESCUE",
            location: { text: "Ward 7 Primary School", latitude: 22.5726, longitude: 88.3639 }
        })
    });

    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.incidentId.startsWith("INC-"));
    assert.equal(data.incident.status, "NEEDS_VERIFICATION");
    assert.equal(data.incident.priority, "P1");
    assert.ok(data.incident.priorityScore.totalScore >= 81);
    assert.equal(data.incident.aiAnalysis.advisory, true);
});

test("API: GET /api/incidents lists created incidents with pagination and filtering", async () => {
    const res = await fetch(`${baseUrl}/api/incidents?limit=10`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(Array.isArray(data.incidents));
    assert.ok(data.total >= 1);
});

test("API: Officer verification workflow verifies incident and allows priority override", async () => {
    // 1. Create a P2/P3 incident
    const createRes = await fetch(`${baseUrl}/api/incidents`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Local-Admin": "true" },
        body: JSON.stringify({
            title: "Blocked storm drain",
            description: "Municipal drainage blocked with debris causing street puddle.",
            category: "DRAINAGE_OVERFLOW",
            location: { text: "Ward 7 Market", latitude: 22.5800, longitude: 88.3700 }
        })
    });
    const created = await createRes.json();
    const incId = created.incidentId;

    // 2. Verify with priority override to P1
    const verifyRes = await fetch(`${baseUrl}/api/incidents/${incId}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Local-Admin": "true" },
        body: JSON.stringify({
            priorityOverride: "P1",
            overrideReason: "Debris blockage threatens nearby electrical substation.",
            notes: "Dispatched drainage maintenance unit"
        })
    });

    assert.equal(verifyRes.status, 200);
    const verifyData = await verifyRes.json();
    assert.equal(verifyData.success, true);
    assert.equal(verifyData.incident.status, "PRIORITIZED");
    assert.equal(verifyData.incident.priority, "P1");
    assert.equal(verifyData.incident.verification.verified, true);
    assert.equal(verifyData.incident.verification.overrideReason, "Debris blockage threatens nearby electrical substation.");

    // Verify audit event trail
    const events = verifyData.incident.events;
    assert.ok(events.some(e => e.type === "PRIORITY_OVERRIDDEN"));
    assert.ok(events.some(e => e.type === "VERIFICATION_COMPLETED"));
});

test("API: Duplicate candidate endpoint detects and merges reports without data loss", async () => {
    // Create two nearby flood reports
    const rep1 = await fetch(`${baseUrl}/api/incidents`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Local-Admin": "true" },
        body: JSON.stringify({
            title: "Flooding on River Road",
            description: "Severe water logging on River Road near Sector 3.",
            category: "FLOOD_RESCUE",
            location: { text: "River Road Sector 3", latitude: 22.5900, longitude: 88.3800 },
            sourceReportIds: ["REP-101"]
        })
    }).then(r => r.json());

    const rep2 = await fetch(`${baseUrl}/api/incidents`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Local-Admin": "true" },
        body: JSON.stringify({
            title: "River Road submerged",
            description: "River Road water level is rising near Sector 3.",
            category: "FLOOD_RESCUE",
            location: { text: "River Road Sector 3", latitude: 22.5905, longitude: 88.3805 },
            sourceReportIds: ["REP-102"]
        })
    }).then(r => r.json());

    // Query duplicate candidates for rep1
    const dupRes = await fetch(`${baseUrl}/api/incidents/${rep1.incidentId}/duplicate-candidates`);
    assert.equal(dupRes.status, 200);
    const dupData = await dupRes.json();
    assert.ok(dupData.candidatesCount >= 1);
    assert.ok(dupData.candidates.some(c => c.targetIncidentId === rep2.incidentId), "Candidate list should include rep2");

    // Merge rep2 into rep1
    const mergeRes = await fetch(`${baseUrl}/api/incidents/${rep1.incidentId}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Local-Admin": "true" },
        body: JSON.stringify({
            duplicateIncidentId: rep2.incidentId,
            reason: "Verified identical flood hazard on River Road"
        })
    });
    assert.equal(mergeRes.status, 200);
    const mergeData = await mergeRes.json();
    assert.equal(mergeData.success, true);
    assert.equal(mergeData.duplicate.status, "DUPLICATE");
    assert.deepEqual(mergeData.primary.sourceReportIds.sort(), ["REP-101", "REP-102"]);
});
