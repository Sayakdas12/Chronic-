// ============================================================
// CHRONICAI RESPONSE NETWORK — RESILIENT STORAGE ADAPTER
// 3-Tier Storage Engine:
// 1. Primary Cloud Persistence: Firebase RTDB (Admin SDK / REST)
// 2. Safe Local / Serverless Persistence: data/*.json with automatic
//    transparent failover to os.tmpdir()/chronicai-data on EROFS
// 3. Write-Through In-Memory Cache: Instant read/write during container lifecycle
// ============================================================

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getDatabase as getAdminDatabase } from "firebase-admin/database";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Primary project data dir (bundled with repository)
export const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
export const PRIMARY_DATA_DIR = path.join(PROJECT_ROOT, "data");

// Serverless writable fallback directory (/tmp)
export const SERVERLESS_TMP_DIR = path.join(os.tmpdir(), "chronicai-data");

// Detect serverless environment (Vercel, AWS Lambda, Netlify, etc.)
export const isServerless = Boolean(
    process.env.VERCEL ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.LAMBDA_TASK_ROOT ||
    process.env.NETLIFY
);

// In-memory cache for fast, zero-latency access and container lifecycle persistence
const memoryStore = new Map();

// Track if primary data dir has thrown a read-only error
let isPrimaryReadOnly = isServerless;

// Map collection names to local file names
const COLLECTION_FILES = {
    incidents: "incidents.json",
    missions: "missions.json",
    resources: "resources.json",
    reports: "reports.json",
    syncOperations: "sync-operations.json",
    roadClosures: "road-closures.json",
    supportRequests: "support-requests.json",
    rescueVehicles: "rescue-vehicles.json",
    missingPersons: "missing-persons.json",
    sosAlerts: "sos-alerts.json"
};

// Map collection names to default ID fields
const ID_FIELDS = {
    incidents: "incidentId",
    missions: "id",
    resources: "id",
    reports: "reportId",
    syncOperations: "id",
    roadClosures: "closureId",
    supportRequests: "requestId",
    rescueVehicles: "vehicleId",
    missingPersons: "personId",
    sosAlerts: "alertId"
};

// ============================================================
// 1. SAFE FILESYSTEM OPERATIONS (Zero EROFS Crashes)
// ============================================================

/**
 * Ensure a directory exists safely without throwing EROFS
 */
export function safeMkdirSync(dirPath) {
    try {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
        return true;
    } catch (err) {
        if (["EROFS", "EACCES", "EPERM"].includes(err.code)) {
            isPrimaryReadOnly = true;
            return false;
        }
        return false;
    }
}

/**
 * Resolve target file path with serverless /tmp fallback
 */
export function resolveFilePath(filename) {
    if (isPrimaryReadOnly) {
        safeMkdirSync(SERVERLESS_TMP_DIR);
        return path.join(SERVERLESS_TMP_DIR, filename);
    }
    return path.join(PRIMARY_DATA_DIR, filename);
}

/**
 * Safe JSON reader: Memory -> /tmp copy -> bundled seed data
 */
export function safeReadJson(filename, defaultValue = []) {
    // 1. Check memory cache first
    const cacheKey = `file:${filename}`;
    if (memoryStore.has(cacheKey)) {
        return memoryStore.get(cacheKey);
    }

    // 2. Check writable /tmp location if in serverless or read-only mode
    if (isPrimaryReadOnly) {
        const tmpPath = path.join(SERVERLESS_TMP_DIR, filename);
        if (fs.existsSync(tmpPath)) {
            try {
                const raw = fs.readFileSync(tmpPath, "utf-8").trim();
                if (raw) {
                    const parsed = JSON.parse(raw);
                    memoryStore.set(cacheKey, parsed);
                    return parsed;
                }
            } catch (err) {
                console.warn(`[StorageAdapter] Failed reading tmp ${filename}:`, err.message);
            }
        }
    }

    // 3. Fallback to reading primary / bundled seed data
    const primaryPath = path.join(PRIMARY_DATA_DIR, filename);
    if (fs.existsSync(primaryPath)) {
        try {
            const raw = fs.readFileSync(primaryPath, "utf-8").trim();
            if (raw) {
                const parsed = JSON.parse(raw);
                memoryStore.set(cacheKey, parsed);
                return parsed;
            }
        } catch (err) {
            console.warn(`[StorageAdapter] Failed reading primary ${filename}:`, err.message);
        }
    }

    // 4. Default fallback
    memoryStore.set(cacheKey, defaultValue);
    return defaultValue;
}

/**
 * Safe JSON writer: Writes to memory cache + disk (/tmp if read-only)
 */
export function safeWriteJson(filename, data) {
    // 1. Always update memory cache immediately
    const cacheKey = `file:${filename}`;
    memoryStore.set(cacheKey, data);

    const serialized = JSON.stringify(data, null, 2);

    // 2. If already known to be read-only, write directly to /tmp
    if (isPrimaryReadOnly) {
        try {
            safeMkdirSync(SERVERLESS_TMP_DIR);
            const targetPath = path.join(SERVERLESS_TMP_DIR, filename);
            const tempPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
            fs.writeFileSync(tempPath, serialized, "utf-8");
            try {
                fs.renameSync(tempPath, targetPath);
            } catch {
                fs.copyFileSync(tempPath, targetPath);
                try { fs.unlinkSync(tempPath); } catch {}
            }
            return true;
        } catch (err) {
            console.warn(`[StorageAdapter] Failed writing tmp ${filename}:`, err.message);
            return false;
        }
    }

    // 3. Try primary data directory
    try {
        safeMkdirSync(PRIMARY_DATA_DIR);
        const targetPath = path.join(PRIMARY_DATA_DIR, filename);
        const tempPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
        fs.writeFileSync(tempPath, serialized, "utf-8");
        try {
            fs.renameSync(tempPath, targetPath);
        } catch {
            fs.copyFileSync(tempPath, targetPath);
            try { fs.unlinkSync(tempPath); } catch {}
        }
        return true;
    } catch (err) {
        if (["EROFS", "EACCES", "EPERM"].includes(err.code)) {
            // Mark primary as read-only and retry in /tmp
            isPrimaryReadOnly = true;
            console.info(`[StorageAdapter] Primary filesystem is read-only (${err.code}). Diverting writes to ${SERVERLESS_TMP_DIR}`);
            return safeWriteJson(filename, data);
        }
        console.error(`[StorageAdapter] Error writing ${filename}:`, err.message);
        return false;
    }
}

/**
 * Fresh JSON reader directly from disk (bypasses memory cache for atomic updates)
 */
export function readFreshJsonFromDisk(filename, defaultValue = []) {
    if (isPrimaryReadOnly) {
        const tmpPath = path.join(SERVERLESS_TMP_DIR, filename);
        if (fs.existsSync(tmpPath)) {
            try {
                const raw = fs.readFileSync(tmpPath, "utf-8").trim();
                if (raw) {
                    const parsed = JSON.parse(raw);
                    memoryStore.set(`file:${filename}`, parsed);
                    return parsed;
                }
            } catch (err) {
                console.warn(`[StorageAdapter] Failed reading fresh tmp ${filename}:`, err.message);
            }
        }
    }

    const primaryPath = path.join(PRIMARY_DATA_DIR, filename);
    if (fs.existsSync(primaryPath)) {
        try {
            const raw = fs.readFileSync(primaryPath, "utf-8").trim();
            if (raw) {
                const parsed = JSON.parse(raw);
                memoryStore.set(`file:${filename}`, parsed);
                return parsed;
            }
        } catch (err) {
            console.warn(`[StorageAdapter] Failed reading fresh primary ${filename}:`, err.message);
        }
    }

    return defaultValue;
}

// ============================================================
// 1.1. ATOMIC CROSS-PROCESS & IN-PROCESS LOCKING (P1 Race Protection)
// ============================================================

const inProcessLocks = new Map();

/**
 * Try to atomically create lock file (O_CREAT | O_EXCL)
 */
export function tryAcquireLock(lockPath, staleMs = 5000) {
    try {
        safeMkdirSync(path.dirname(lockPath));
        const fd = fs.openSync(lockPath, "wx");
        const payload = JSON.stringify({ pid: process.pid, createdAt: Date.now() });
        fs.writeFileSync(fd, payload, "utf-8");
        fs.closeSync(fd);
        return true;
    } catch (err) {
        if (err.code === "EEXIST") {
            try {
                const stats = fs.statSync(lockPath);
                if (Date.now() - stats.mtimeMs > staleMs) {
                    // Stale lock cleanup
                    try { fs.unlinkSync(lockPath); } catch {}
                    const fd = fs.openSync(lockPath, "wx");
                    const payload = JSON.stringify({ pid: process.pid, createdAt: Date.now(), recovered: true });
                    fs.writeFileSync(fd, payload, "utf-8");
                    fs.closeSync(fd);
                    return true;
                }
            } catch {}
            return false;
        }
        return false;
    }
}

/**
 * Acquire cross-process file lock with backoff retry
 */
export async function acquireFileLock(filename, { timeoutMs = 5000, retryIntervalMs = 15, staleMs = 5000 } = {}) {
    const lockPath = resolveFilePath(`${filename}.lock`);
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
        if (tryAcquireLock(lockPath, staleMs)) {
            return () => {
                try { fs.unlinkSync(lockPath); } catch {}
            };
        }
        const jitter = Math.floor(Math.random() * 20);
        await new Promise((resolve) => setTimeout(resolve, retryIntervalMs + jitter));
    }

    console.warn(`[StorageAdapter] Lock acquisition timed out for ${filename}. Proceeding with fail-safe release.`);
    return () => {
        try { fs.unlinkSync(lockPath); } catch {}
    };
}

/**
 * Serialize operations with both in-process mutex and cross-process file lock
 */
export async function withFileLock(filename, fn) {
    const queueKey = `lock:${filename}`;
    let releaseInProcess;
    const inProcessWait = new Promise((resolve) => {
        releaseInProcess = resolve;
    });
    const prevPromise = inProcessLocks.get(queueKey) || Promise.resolve();
    inProcessLocks.set(queueKey, prevPromise.then(() => inProcessWait));

    await prevPromise;

    let releaseFile = null;
    try {
        releaseFile = await acquireFileLock(filename);
        // Evict memory cache to ensure fresh read from disk
        memoryStore.delete(`file:${filename}`);
        return await fn();
    } finally {
        if (releaseFile) {
            try { releaseFile(); } catch {}
        }
        releaseInProcess();
        if (inProcessLocks.get(queueKey) === inProcessWait) {
            inProcessLocks.delete(queueKey);
        }
    }
}

// ============================================================
// 2. RESILIENT FIREBASE CREDENTIAL PARSER & CLIENT
// ============================================================

/**
 * Parse Firebase Service Account from file path, JSON string, or Base64 string
 */
export function parseFirebaseCredentials() {
    const serviceAccountFile = process.env.FIREBASE_SERVICE_ACCOUNT_FILE;
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

    // Try file path only if it actually exists on disk
    if (serviceAccountFile && fs.existsSync(serviceAccountFile)) {
        try {
            const raw = fs.readFileSync(serviceAccountFile, "utf-8");
            const parsed = JSON.parse(raw);
            if (parsed && parsed.private_key) {
                parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
            }
            return parsed;
        } catch (err) {
            console.warn("[StorageAdapter] Failed parsing FIREBASE_SERVICE_ACCOUNT_FILE:", err.message);
        }
    }

    // Try JSON string or Base64 string
    const trimmedJson = typeof serviceAccountJson === "string" ? serviceAccountJson.trim() : "";
    if (trimmedJson && trimmedJson !== "undefined" && trimmedJson !== "null" && !trimmedJson.includes('"project_id":"your-project"')) {
        let candidate = trimmedJson;
        // If candidate looks like base64, decode it
        if (!candidate.startsWith("{") && candidate.length > 50) {
            try {
                candidate = Buffer.from(candidate, "base64").toString("utf-8");
            } catch {}
        }
        try {
            const parsed = JSON.parse(candidate);
            if (parsed && parsed.private_key) {
                parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
            }
            return parsed;
        } catch (err) {
            console.warn("[StorageAdapter] Failed parsing FIREBASE_SERVICE_ACCOUNT_JSON:", err.message);
        }
    }

    return null;
}

let cachedAdminApp = null;

/**
 * Get or initialize Firebase Admin App safely
 */
export function getAdminApp() {
    if (getApps().length) return getApps()[0];
    if (cachedAdminApp) return cachedAdminApp;

    const credentials = parseFirebaseCredentials();
    const databaseURL = process.env.FIREBASE_DATABASE_URL;

    if (!credentials || !databaseURL) {
        throw new Error("Firebase Admin credentials or databaseURL are not configured.");
    }

    cachedAdminApp = initializeApp({
        credential: cert(credentials),
        databaseURL
    });
    return cachedAdminApp;
}

/**
 * Check whether Firebase Realtime Database is accessible
 */
export function isFirebaseCloudEnabled() {
    const hasDbUrl = Boolean(process.env.FIREBASE_DATABASE_URL);
    const hasCreds = Boolean(parseFirebaseCredentials());
    return Boolean(hasDbUrl && hasCreds);
}

let restDisabled = false;

/**
 * Check if Firebase REST API fallback is usable (has databaseURL)
 */
export function isFirebaseRestEnabled() {
    if (restDisabled) return false;
    if (process.env.NODE_ENV === "test" || process.env.CHRONICAI_DISABLE_CLOUD === "true") {
        return false;
    }
    return Boolean(
        process.env.FIREBASE_REST_ENABLED === "true" ||
        (isServerless && process.env.FIREBASE_DATABASE_URL && !isFirebaseCloudEnabled())
    );
}

// ============================================================
// 3. CLOUD REST API FALLBACK (When Admin SDK is not authenticated)
// ============================================================

async function fetchWithTimeout(url, options = {}, timeoutMs = 1500) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { ...options, signal: controller.signal });
        return res;
    } finally {
        clearTimeout(timer);
    }
}

async function firebaseRestRead(collectionName) {
    if (!isFirebaseRestEnabled()) return null;
    const baseUrl = process.env.FIREBASE_DATABASE_URL?.replace(/\/+$/, "");
    if (!baseUrl) return null;
    try {
        const res = await fetchWithTimeout(`${baseUrl}/${collectionName}.json`);
        if (!res.ok) {
            if ([401, 403, 404].includes(res.status)) {
                restDisabled = true;
            }
            return null;
        }
        const val = await res.json();
        if (!val) return null;
        return Array.isArray(val) ? val.filter(Boolean) : Object.values(val);
    } catch {
        restDisabled = true;
        return null;
    }
}

async function firebaseRestWriteItem(collectionName, id, item) {
    if (!isFirebaseRestEnabled()) return false;
    const baseUrl = process.env.FIREBASE_DATABASE_URL?.replace(/\/+$/, "");
    if (!baseUrl || !id) return false;
    try {
        const res = await fetchWithTimeout(`${baseUrl}/${collectionName}/${encodeURIComponent(id)}.json`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(item)
        });
        if (!res.ok && [401, 403, 404].includes(res.status)) {
            restDisabled = true;
        }
        return res.ok;
    } catch {
        restDisabled = true;
        return false;
    }
}

// ============================================================
// 4. UNIFIED HIGH-LEVEL COLLECTION CRUD
// ============================================================

function extractItemId(item, defaultField = "id") {
    if (!item || typeof item !== "object") return null;
    return (
        item[defaultField] ||
        item.id ||
        item.incidentId ||
        item.reportId ||
        item.missionId ||
        item.closureId ||
        item.vehicleId ||
        item.requestId ||
        item.personId ||
        item.alertId ||
        null
    );
}

/**
 * Read all items from a collection (Cloud -> Local Safe File -> Seed)
 */
export async function readCollection(collectionName, defaultVal = []) {
    const filename = COLLECTION_FILES[collectionName] || `${collectionName}.json`;

    // 1. Try Firebase Cloud (Admin SDK)
    if (isFirebaseCloudEnabled()) {
        try {
            const db = getAdminDatabase(getAdminApp());
            const snapshot = await db.ref(collectionName).once("value");
            const val = snapshot.val();
            if (val) {
                const items = Array.isArray(val) ? val.filter(Boolean) : Object.values(val);
                // Keep local /tmp cache in sync
                safeWriteJson(filename, items);
                return items;
            }
        } catch (err) {
            console.warn(`[StorageAdapter] Firebase Admin read failed for ${collectionName}:`, err.message);
        }
    }

    // 2. Try Firebase Cloud (REST fallback if enabled)
    if (isFirebaseRestEnabled() && !isFirebaseCloudEnabled()) {
        try {
            const items = await firebaseRestRead(collectionName);
            if (items && items.length > 0) {
                safeWriteJson(filename, items);
                return items;
            }
        } catch {}
    }

    // 3. Local safe reader (Memory / Tmp / Primary file)
    return safeReadJson(filename, defaultVal);
}

/**
 * Get a single item by ID
 */
export async function getItem(collectionName, id) {
    if (!id) return null;
    const defaultField = ID_FIELDS[collectionName] || "id";

    // 1. Try Firebase Cloud (Admin SDK)
    if (isFirebaseCloudEnabled()) {
        try {
            const db = getAdminDatabase(getAdminApp());
            const snapshot = await db.ref(`${collectionName}/${id}`).once("value");
            if (snapshot.exists()) {
                return snapshot.val();
            }
        } catch (err) {
            console.warn(`[StorageAdapter] Firebase Admin getItem failed for ${collectionName}/${id}:`, err.message);
        }
    }

    // 2. Search local collection
    const items = await readCollection(collectionName, []);
    return (
        items.find((item) => {
            const itemId = extractItemId(item, defaultField);
            return itemId === id || item.id === id || item.publicId === id;
        }) || null
    );
}

/**
 * Save / update a single item in a collection (Atomic with cross-process locking)
 */
export async function saveItem(collectionName, id, item) {
    if (!item) throw new Error(`Cannot save empty item to ${collectionName}`);
    const defaultField = ID_FIELDS[collectionName] || "id";
    const itemId = id || extractItemId(item, defaultField);

    if (!itemId) {
        throw new Error(`Cannot save item to ${collectionName}: missing identifier.`);
    }

    item.updatedAt = item.updatedAt || Date.now();
    const filename = COLLECTION_FILES[collectionName] || `${collectionName}.json`;

    return await withFileLock(filename, async () => {
        // 1. Write to Cloud (Admin SDK)
        let cloudWritten = false;
        if (isFirebaseCloudEnabled()) {
            try {
                const db = getAdminDatabase(getAdminApp());
                await db.ref(`${collectionName}/${itemId}`).set(item);
                cloudWritten = true;
            } catch (err) {
                console.warn(`[StorageAdapter] Firebase save failed for ${collectionName}/${itemId}:`, err.message);
            }
        }

        // 2. If Admin SDK not used, try REST write
        if (!cloudWritten && isFirebaseRestEnabled()) {
            await firebaseRestWriteItem(collectionName, itemId, item);
        }

        // 3. Always write-through to local safe store & memory with fresh on-disk read
        const items = readFreshJsonFromDisk(filename, []);
        const index = items.findIndex((existing) => extractItemId(existing, defaultField) === itemId);

        if (index >= 0) {
            items[index] = item;
        } else {
            items.unshift(item);
        }
        safeWriteJson(filename, items);

        return item;
    });
}

/**
 * Save an entire array of items to a collection (Atomic with cross-process locking)
 */
export async function saveCollection(collectionName, items) {
    if (!Array.isArray(items)) {
        throw new Error(`saveCollection expects an array for ${collectionName}`);
    }

    const defaultField = ID_FIELDS[collectionName] || "id";
    const filename = COLLECTION_FILES[collectionName] || `${collectionName}.json`;

    return await withFileLock(filename, async () => {
        // 1. Cloud persistence (Admin SDK)
        if (isFirebaseCloudEnabled()) {
            try {
                const db = getAdminDatabase(getAdminApp());
                const updates = {};
                for (const item of items) {
                    const id = extractItemId(item, defaultField);
                    if (id) updates[id] = item;
                }
                await db.ref(collectionName).set(updates);
            } catch (err) {
                console.warn(`[StorageAdapter] Cloud batch save failed for ${collectionName}:`, err.message);
            }
        }

        // 2. Safe local write
        safeWriteJson(filename, items);
        return items;
    });
}

/**
 * Delete an item from a collection (Atomic with cross-process locking)
 */
export async function deleteItem(collectionName, id) {
    if (!id) return false;
    const defaultField = ID_FIELDS[collectionName] || "id";
    const filename = COLLECTION_FILES[collectionName] || `${collectionName}.json`;

    return await withFileLock(filename, async () => {
        if (isFirebaseCloudEnabled()) {
            try {
                const db = getAdminDatabase(getAdminApp());
                await db.ref(`${collectionName}/${id}`).remove();
            } catch (err) {
                console.warn(`[StorageAdapter] Cloud delete failed for ${collectionName}/${id}:`, err.message);
            }
        }

        const items = readFreshJsonFromDisk(filename, []);
        const filtered = items.filter((item) => extractItemId(item, defaultField) !== id);
        safeWriteJson(filename, filtered);
        return true;
    });
}

/**
 * Force simulate read-only filesystem (for testing serverless behavior)
 */
export function setSimulateReadOnly(isReadOnly) {
    isPrimaryReadOnly = Boolean(isReadOnly);
}

/**
 * Reset memory store (useful for clean unit testing)
 */
export function resetMemoryStoreForTesting() {
    memoryStore.clear();
    isPrimaryReadOnly = isServerless;
}
