// ============================================================
// CHRONICAI RESPONSE NETWORK — FIELD-WORKER OFFLINE SYNC CLIENT
// Durable IndexedDB storage with Dexie / native IndexedDB fallback,
// optimistic queueing, and automatic delta synchronization.
// ============================================================

const DB_NAME = "ChronicAIOfflineDB";
const DB_VERSION = 1;

let dbInstance = null;

// Lightweight Promise-based IndexedDB wrapper
export async function openOfflineDb() {
    if (dbInstance) return dbInstance;

    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains("incidents")) {
                db.createObjectStore("incidents", { keyPath: "incidentId" });
            }
            if (!db.objectStoreNames.contains("missions")) {
                db.createObjectStore("missions", { keyPath: "id" });
            }
            if (!db.objectStoreNames.contains("resources")) {
                db.createObjectStore("resources", { keyPath: "id" });
            }
            if (!db.objectStoreNames.contains("syncQueue")) {
                const store = db.createObjectStore("syncQueue", { keyPath: "id" });
                store.createIndex("status", "status", { unique: false });
                store.createIndex("clientCreatedAt", "clientCreatedAt", { unique: false });
            }
            if (!db.objectStoreNames.contains("roadClosures")) {
                db.createObjectStore("roadClosures", { keyPath: "id" });
            }
        };

        request.onsuccess = (event) => {
            dbInstance = event.target.result;
            resolve(dbInstance);
        };

        request.onerror = (event) => {
            console.error("IndexedDB open error:", event.target.error);
            reject(event.target.error);
        };
    });
}

function runTransaction(storeName, mode, callback) {
    return openOfflineDb().then((db) => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, mode);
            const store = tx.objectStore(storeName);
            const request = callback(store);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    });
}

// Generate client operation ID
export function generateClientOperationId() {
    const timestamp = Date.now().toString(36);
    const entropy = Math.random().toString(36).substring(2, 9);
    return `op_client_${timestamp}_${entropy}`;
}

// ============================================================
// QUEUE MUTATIONS OFFLINE
// ============================================================

export async function enqueueOfflineOperation({ type, entityId, payload = {}, deviceId = "device_field_worker" }) {
    const id = generateClientOperationId();
    const op = {
        id,
        deviceId,
        type,
        entityId,
        payload,
        clientCreatedAt: Date.now(),
        status: "PENDING",
        retryCount: 0
    };

    await runTransaction("syncQueue", "readwrite", (store) => store.put(op));

    // Optimistic local cache update
    if (type === "MISSION_STATUS_UPDATE") {
        const mission = await getLocalMission(entityId);
        if (mission) {
            mission.status = payload.status;
            mission.notes = payload.notes || mission.notes;
            mission.updatedAt = Date.now();
            await runTransaction("missions", "readwrite", (store) => store.put(mission));
        }
    } else if (type === "RECORD_RESCUE") {
        const incident = await getLocalIncident(entityId);
        if (incident) {
            incident.rescuedPeople = (incident.rescuedPeople || 0) + (parseInt(payload.rescuedCount, 10) || 1);
            incident.updatedAt = Date.now();
            await runTransaction("incidents", "readwrite", (store) => store.put(incident));
        }
    } else if (type === "REPORT_ROAD_CLOSURE") {
        const closure = {
            id: `closure_${Date.now()}`,
            roadName: payload.roadName || "Blocked Road",
            latitude: payload.latitude,
            longitude: payload.longitude,
            reason: payload.reason,
            reportedAt: Date.now()
        };
        await runTransaction("roadClosures", "readwrite", (store) => store.put(closure));
    }

    return op;
}

export async function getPendingSyncOperations() {
    const db = await openOfflineDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("syncQueue", "readonly");
        const store = tx.objectStore("syncQueue");
        const request = store.getAll();

        request.onsuccess = () => {
            const all = request.result || [];
            const pending = all.filter(op => op.status === "PENDING");
            pending.sort((a, b) => a.clientCreatedAt - b.clientCreatedAt);
            resolve(pending);
        };
        request.onerror = () => reject(request.error);
    });
}

// ============================================================
// PUSH QUEUE TO SERVER
// ============================================================

export async function flushSyncQueue({ baseUrl = "", workerId = "field_worker_1" } = {}) {
    const pending = await getPendingSyncOperations();
    if (!pending.length) {
        return { success: true, processed: 0, applied: 0 };
    }

    try {
        const response = await fetch(`${baseUrl}/api/sync/push`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Worker-Id": workerId
            },
            body: JSON.stringify({ operations: pending })
        });

        if (!response.ok) {
            throw new Error(`Server returned ${response.status}`);
        }

        const data = await response.json();

        // Update local sync queue status
        for (const res of data.results || []) {
            const op = pending.find(p => p.id === res.operationId);
            if (op) {
                op.status = res.status;
                op.serverResult = res.result || null;
                op.serverError = res.error || null;
                await runTransaction("syncQueue", "readwrite", (store) => store.put(op));
            }
        }

        return data;
    } catch (error) {
        console.warn("Offline sync push deferred (network unreachable):", error.message);
        // Increment retry count
        for (const op of pending) {
            op.retryCount += 1;
            await runTransaction("syncQueue", "readwrite", (store) => store.put(op));
        }
        return { success: false, deferred: true, pendingCount: pending.length, error: error.message };
    }
}

// ============================================================
// PULL SERVER DELTA TO LOCAL CACHE
// ============================================================

export async function pullServerDelta({ baseUrl = "", assignedTo = null } = {}) {
    try {
        const lastSync = parseInt(localStorage.getItem("lastSyncTimestamp"), 10) || 0;
        const params = new URLSearchParams({ sinceTimestamp: String(lastSync) });
        if (assignedTo) params.set("assignedTo", assignedTo);

        const response = await fetch(`${baseUrl}/api/sync/pull?${params}`);
        if (!response.ok) throw new Error(`Pull failed: ${response.status}`);

        const data = await response.json();
        const delta = data.delta || {};

        // Upsert into IndexedDB
        if (Array.isArray(delta.incidents)) {
            for (const inc of delta.incidents) {
                await runTransaction("incidents", "readwrite", (store) => store.put(inc));
            }
        }
        if (Array.isArray(delta.missions)) {
            for (const msn of delta.missions) {
                await runTransaction("missions", "readwrite", (store) => store.put(msn));
            }
        }
        if (Array.isArray(delta.resources)) {
            for (const res of delta.resources) {
                await runTransaction("resources", "readwrite", (store) => store.put(res));
            }
        }
        if (Array.isArray(delta.roadClosures)) {
            for (const rc of delta.roadClosures) {
                await runTransaction("roadClosures", "readwrite", (store) => store.put(rc));
            }
        }

        localStorage.setItem("lastSyncTimestamp", String(data.serverTime || Date.now()));
        return { success: true, delta };
    } catch (error) {
        console.warn("Pull delta deferred (offline):", error.message);
        return { success: false, offline: true, error: error.message };
    }
}

// ============================================================
// LOCAL CACHE GETTERS
// ============================================================

export async function getLocalIncident(incidentId) {
    return runTransaction("incidents", "readonly", (store) => store.get(incidentId));
}

export async function getLocalMission(missionId) {
    return runTransaction("missions", "readonly", (store) => store.get(missionId));
}

export async function getAllLocalMissions() {
    const db = await openOfflineDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("missions", "readonly");
        const request = tx.objectStore("missions").getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
}

// Automatically sync when device reconnects
export function setupNetworkSyncListener({ baseUrl = "", workerId = "field_worker_1" } = {}) {
    window.addEventListener("online", async () => {
        console.log("Device reconnected to network. Synchronizing offline queue...");
        await flushSyncQueue({ baseUrl, workerId });
        await pullServerDelta({ baseUrl, assignedTo: workerId });
    });
}
