import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
    saveItem,
    getItem,
    readCollection,
    deleteItem,
    acquireFileLock,
    tryAcquireLock,
    resolveFilePath,
    resetMemoryStoreForTesting
} from "../server/storage/storage-adapter.js";

import { saveIncident, getIncidentById } from "../server/services/incident-service.js";
import { saveMission, getMissionById } from "../server/services/mission-service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.beforeEach(() => {
    resetMemoryStoreForTesting();
});

test.afterEach(() => {
    resetMemoryStoreForTesting();
});

test("Atomic File Lock: tryAcquireLock and acquireFileLock enforce mutual exclusion and release", async () => {
    const lockTarget = `test-mutex-${Date.now()}`;
    const lockPath = resolveFilePath(`${lockTarget}.lock`);

    // 1. First acquisition succeeds
    const releaseLock = await acquireFileLock(lockTarget);
    assert.equal(typeof releaseLock, "function", "acquireFileLock should return release function");

    // 2. Second attempt while locked fails
    const secondTry = tryAcquireLock(lockPath);
    assert.equal(secondTry, false, "Concurrent tryAcquireLock should fail while lock is held");

    // 3. Release lock
    releaseLock();

    // 4. Acquisition succeeds after release
    const thirdTry = tryAcquireLock(lockPath);
    assert.equal(thirdTry, true, "tryAcquireLock should succeed after lock is released");

    // Cleanup
    try { fs.unlinkSync(lockPath); } catch {}
});

test("Stale Lock Auto-Recovery: Reclaims lock if previous holder died or exceeded stale threshold", () => {
    const lockTarget = `test-stale-${Date.now()}`;
    const lockPath = resolveFilePath(`${lockTarget}.lock`);

    // Create an artificial stale lock file with an old modification timestamp
    fs.writeFileSync(lockPath, JSON.stringify({ pid: 999999, createdAt: Date.now() - 10000 }), "utf-8");
    const oldTime = new Date(Date.now() - 10000);
    fs.utimesSync(lockPath, oldTime, oldTime);

    // tryAcquireLock with a 3000ms threshold should reclaim the lock
    const acquired = tryAcquireLock(lockPath, 3000);
    assert.equal(acquired, true, "Should successfully reclaim stale lock");

    // Cleanup
    try { fs.unlinkSync(lockPath); } catch {}
});

test("Parallel Concurrency: 20 simultaneous async writes to incidents collection preserve every record (Zero Data Loss)", async () => {
    const count = 20;
    const batchId = Date.now().toString(36);

    const promises = Array.from({ length: count }, (_, i) => {
        const incidentId = `INC-RACE-${batchId}-${String(i).padStart(2, "0")}`;
        return saveIncident({
            incidentId,
            publicId: `PUB-${incidentId}`,
            title: `Concurrent Flood Stress Report ${i + 1}`,
            description: `Testing zero data loss under concurrent cluster load ${i}`,
            priority: "P1",
            status: "REPORTED",
            createdAt: Date.now() + i
        });
    });

    const results = await Promise.all(promises);
    assert.equal(results.length, count, `All ${count} promises should resolve`);

    // Verify all 20 exist in the collection
    const allIncidents = await readCollection("incidents", []);
    for (let i = 0; i < count; i++) {
        const targetId = `INC-RACE-${batchId}-${String(i).padStart(2, "0")}`;
        const found = allIncidents.find(item => item.incidentId === targetId);
        assert.ok(found, `Incident ${targetId} must be present in saved incidents`);
        assert.equal(found.title, `Concurrent Flood Stress Report ${i + 1}`);
    }

    // Clean up test records
    await Promise.all(
        Array.from({ length: count }, (_, i) => {
            const incidentId = `INC-RACE-${batchId}-${String(i).padStart(2, "0")}`;
            return deleteItem("incidents", incidentId);
        })
    );
});

test("Parallel Concurrency: 10 simultaneous async writes to missions collection preserve all dispatches", async () => {
    const count = 10;
    const batchId = Date.now().toString(36);

    const promises = Array.from({ length: count }, (_, i) => {
        const missionId = `MSN-RACE-${batchId}-${i}`;
        return saveMission({
            id: missionId,
            incidentId: `INC-DEMO-${i}`,
            resourceId: `res_${i}`,
            assignedTo: `responder_${i}`,
            status: "ASSIGNED",
            createdAt: Date.now() + i
        });
    });

    await Promise.all(promises);

    const allMissions = await readCollection("missions", []);
    for (let i = 0; i < count; i++) {
        const targetId = `MSN-RACE-${batchId}-${i}`;
        const found = allMissions.find(m => m.id === targetId);
        assert.ok(found, `Mission ${targetId} must exist in missions`);
        assert.equal(found.assignedTo, `responder_${i}`);
    }

    // Clean up
    await Promise.all(
        Array.from({ length: count }, (_, i) => {
            const missionId = `MSN-RACE-${batchId}-${i}`;
            return deleteItem("missions", missionId);
        })
    );
});
