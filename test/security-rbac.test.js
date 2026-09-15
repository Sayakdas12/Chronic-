// ============================================================
// CHRONICAI RESPONSE NETWORK — ZERO-TRUST SECURITY & RBAC INTEGRATION TESTS
// Verifies that unauthenticated or unauthorized role attempts are strictly blocked
// ============================================================

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { app } from "../server/firebase.js";
import { signSessionToken } from "../server/middleware/auth-middleware.js";

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

test("Security RBAC: GET /api/auth/me returns 401 when no token is provided", async () => {
    const res = await fetch(`${baseUrl}/api/auth/me`);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.success, false);
});

test("Security RBAC: POST /api/auth/session issues valid cryptographic tokens", async () => {
    const res = await fetch(`${baseUrl}/api/auth/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "citizen@chronic.gov", role: "citizen" })
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.token);
    assert.equal(body.user.role, "citizen");

    // Verify /api/auth/me with this citizen token
    const meRes = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${body.token}` }
    });
    assert.equal(meRes.status, 200);
    const meBody = await meRes.json();
    assert.equal(meBody.user.role, "citizen");
});

test("Security RBAC: Calling POST /api/missions without auth token returns 401 Unauthorized", async () => {
    const res = await fetch(`${baseUrl}/api/missions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            incidentId: "INC-TEST-1",
            resourceId: "res-1"
        })
    });

    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.ok(body.error.includes("Authentication required"));
});

test("Security RBAC: Citizen token attempting POST /api/missions returns 403 Forbidden", async () => {
    const citizenToken = signSessionToken({
        uid: "citizen-1",
        email: "citizen@chronic.gov",
        role: "citizen",
        name: "Test Citizen"
    });

    const res = await fetch(`${baseUrl}/api/missions`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${citizenToken}`
        },
        body: JSON.stringify({
            incidentId: "INC-TEST-1",
            resourceId: "res-1"
        })
    });

    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.ok(body.error.includes("Access denied"));
});

test("Security RBAC: Citizen token attempting POST /api/incidents/:id/verify returns 403 Forbidden", async () => {
    const citizenToken = signSessionToken({
        uid: "citizen-1",
        email: "citizen@chronic.gov",
        role: "citizen",
        name: "Test Citizen"
    });

    const res = await fetch(`${baseUrl}/api/incidents/INC-101/verify`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${citizenToken}`
        },
        body: JSON.stringify({ notes: "Attempting unauthorized verification" })
    });

    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.ok(body.error.includes("Access denied"));
});

test("Security RBAC: Citizen token attempting POST /api/dashboard/seed-ward7 returns 403 Forbidden", async () => {
    const citizenToken = signSessionToken({
        uid: "citizen-1",
        email: "citizen@chronic.gov",
        role: "citizen",
        name: "Test Citizen"
    });

    const res = await fetch(`${baseUrl}/api/dashboard/seed-ward7`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${citizenToken}`
        }
    });

    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.success, false);
});

test("Security RBAC: Officer token successfully dispatches mission and verifies incident", async () => {
    const officerToken = signSessionToken({
        uid: "officer-eoc-1",
        email: "officer@chronic.gov",
        role: "admin",
        name: "Commander Banerjee"
    });

    // 1. Create an incident first (citizens can create incidents)
    const incRes = await fetch(`${baseUrl}/api/incidents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            title: "Severe flash flood near bridge",
            description: "Bridge overpass water level exceeding 1.5m",
            category: "FLOOD_RESCUE",
            location: { text: "Bridge 4", latitude: 22.57, longitude: 88.36 }
        })
    });
    assert.equal(incRes.status, 201);
    const { incidentId } = await incRes.json();

    // 2. Officer verifies incident
    const verifyRes = await fetch(`${baseUrl}/api/incidents/${incidentId}/verify`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${officerToken}`
        },
        body: JSON.stringify({ notes: "Verified by EOC Commander" })
    });
    assert.equal(verifyRes.status, 200);
    const verifyData = await verifyRes.json();
    assert.equal(verifyData.success, true);
    assert.equal(verifyData.incident.status, "PRIORITIZED");

    // 3. Officer dispatches mission
    const dispatchRes = await fetch(`${baseUrl}/api/missions`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${officerToken}`
        },
        body: JSON.stringify({
            incidentId,
            resourceId: "rescue_r04",
            assignedTo: "unit_boat4",
            etaMinutes: 5
        })
    });
    assert.equal(dispatchRes.status, 201);
    const dispatchData = await dispatchRes.json();
    assert.equal(dispatchData.success, true);
    const missionId = dispatchData.mission.id;

    // 4. Citizen cannot update mission status
    const citizenToken = signSessionToken({ uid: "cit-1", role: "citizen" });
    const citPatchRes = await fetch(`${baseUrl}/api/missions/${missionId}/status`, {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${citizenToken}`
        },
        body: JSON.stringify({ status: "ARRIVED" })
    });
    assert.equal(citPatchRes.status, 403);

    // 5. Field Responder token CAN update mission status
    const responderToken = signSessionToken({
        uid: "responder-boat-4",
        email: "responder@chronic.gov",
        role: "responder",
        name: "NDRF Unit 04"
    });
    const respPatchRes = await fetch(`${baseUrl}/api/missions/${missionId}/status`, {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${responderToken}`
        },
        body: JSON.stringify({ status: "ARRIVED", notes: "Unit arrived at site" })
    });
    assert.equal(respPatchRes.status, 200);
    const respPatchData = await respPatchRes.json();
    assert.equal(respPatchData.success, true);
    assert.equal(respPatchData.mission.status, "ARRIVED");
});
