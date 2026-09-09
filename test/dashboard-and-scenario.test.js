import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { app } from "../server/firebase.js";
import { seedWard7Scenario } from "../server/seed/ward7-scenario.js";
import { generateDistrictBriefing } from "../server/services/briefing-service.js";

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

test("Ward 7 Scenario Seeder: Seeds reports, canonical incidents, resources, and missions", async () => {
    const stats = await seedWard7Scenario();
    assert.equal(stats.reportsCount, 20, "Should seed 20 citizen reports");
    assert.equal(stats.incidentsCount, 6, "Should seed 6 canonical incidents");
    assert.ok(stats.resourcesCount >= 7, "Should seed at least 4 ambulances and 3 rescue teams");
    assert.ok(stats.roadClosuresCount >= 2, "Should seed at least 2 road closures");
});

test("District SitRep Briefing Service: Generates live operational briefing from telemetry", async () => {
    // Ensure data is seeded
    await seedWard7Scenario();

    const result = await generateDistrictBriefing({ district: "Ward 7" });
    assert.equal(result.success, true);
    assert.equal(result.district, "Ward 7");
    assert.ok(result.metrics.p1Count >= 2, "Should detect multiple active P1 emergencies");
    assert.ok(result.metrics.totalVictimsAtRisk > 0, "Should report casualties at risk");
    assert.ok(result.metrics.blockedRoadsCount >= 2, "Should report blocked routes");

    assert.ok(result.briefing.headline, "Should contain SitRep headline");
    assert.ok(["CRITICAL", "HIGH", "ELEVATED"].includes(result.briefing.threatLevel), "Threat level should be appropriate");
    assert.ok(Array.isArray(result.briefing.tacticalDirectives), "Should have tactical directives array");
    assert.ok(result.briefing.tacticalDirectives.length >= 3, "Should have at least 3 directives");
    assert.ok(result.briefing.routeAdvisory, "Should contain route advisory");
    assert.ok(result.briefing.casualtySitRep, "Should contain casualty sitrep");
});

test("API: POST /api/dashboard/seed-ward7 triggers scenario seeding", async () => {
    const res = await fetch(`${baseUrl}/api/dashboard/seed-ward7`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.stats);
    assert.equal(body.stats.reportsCount, 20);
    assert.equal(body.stats.incidentsCount, 6);
});

test("API: GET /api/dashboard/briefing returns live district situation report", async () => {
    const res = await fetch(`${baseUrl}/api/dashboard/briefing?district=Ward%207`);
    assert.equal(res.status, 200);
    const body = await res.json();

    assert.equal(body.success, true);
    assert.equal(body.district, "Ward 7");
    assert.ok(body.metrics);
    assert.ok(body.briefing);
    assert.ok(body.briefing.headline.length > 5);
});

test("Integration: Seeded Canonical Incidents and Resources can be queried via API", async () => {
    // 1. Get canonical incidents
    const incRes = await fetch(`${baseUrl}/api/incidents`, {
        headers: { "X-Local-Admin": "true" }
    });
    assert.equal(incRes.status, 200);
    const incBody = await incRes.json();
    assert.ok(incBody.incidents.length > 0);
    const floodInc = incBody.incidents.find(i => (i.incidentId || i.id) === "INC-2026-FLOOD-01");
    assert.ok(floodInc, "Should contain INC-2026-FLOOD-01");
    assert.equal(floodInc.priority, "P1");

    // 2. Recommend resources for seeded P1 incident
    const recRes = await fetch(`${baseUrl}/api/resources/recommend/INC-2026-FLOOD-01`, {
        headers: { "X-Local-Admin": "true" }
    });
    assert.equal(recRes.status, 200);
    const recBody = await recRes.json();
    assert.equal(recBody.success, true);
    assert.ok(recBody.recommendations.length <= 3);
    assert.ok(recBody.recommendations.length >= 1);
    assert.ok(recBody.recommendations[0].score > 0);

    // 3. Check duplicate candidates for school flood report
    const dupRes = await fetch(`${baseUrl}/api/incidents/INC-2026-FLOOD-01/duplicate-candidates`, {
        headers: { "X-Local-Admin": "true" }
    });
    assert.equal(dupRes.status, 200);
    const dupBody = await dupRes.json();
    assert.equal(dupBody.success, true);
    assert.ok(Array.isArray(dupBody.candidates));
});
