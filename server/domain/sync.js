// ============================================================
// CHRONICAI RESPONSE NETWORK — OFFLINE SYNC DOMAIN MODEL
// SyncOperation entities, mutation types, and conflict states
// ============================================================

export const SyncOperationType = Object.freeze({
    MISSION_STATUS_UPDATE: "MISSION_STATUS_UPDATE",
    RECORD_RESCUE: "RECORD_RESCUE",
    REPORT_ROAD_CLOSURE: "REPORT_ROAD_CLOSURE",
    OFFLINE_REPORT_CREATE: "OFFLINE_REPORT_CREATE",
    FIELD_NOTE_ADDED: "FIELD_NOTE_ADDED"
});

export const SyncOperationStatus = Object.freeze({
    PENDING: "PENDING",
    APPLIED: "APPLIED",
    CONFLICT: "CONFLICT",
    REJECTED: "REJECTED"
});

export function generateOperationId() {
    const timestamp = Date.now().toString(36);
    const entropy = Math.random().toString(36).substring(2, 8);
    return `op_${timestamp}_${entropy}`;
}

export function buildSyncOperation({
    id = generateOperationId(),
    deviceId = "device_anonymous",
    type,
    entityId,
    payload = {},
    clientCreatedAt = Date.now(),
    status = SyncOperationStatus.PENDING,
    retryCount = 0
}) {
    if (!type || !SyncOperationType[type]) {
        throw new Error(`Invalid sync operation type: ${type}`);
    }

    return {
        id: String(id).trim(),
        deviceId: String(deviceId).trim(),
        type,
        entityId: String(entityId || "").trim(),
        payload: payload && typeof payload === "object" ? payload : {},
        clientCreatedAt: Number(clientCreatedAt) || Date.now(),
        serverReceivedAt: Date.now(),
        status: SyncOperationStatus[status] || SyncOperationStatus.PENDING,
        retryCount: Math.max(0, parseInt(retryCount, 10) || 0)
    };
}

export function validateSyncOperation(op) {
    if (!op || typeof op !== "object") return "Operation must be a JSON object.";
    if (!op.id || typeof op.id !== "string") return "Operation missing valid 'id'.";
    if (!op.type || !SyncOperationType[op.type]) return `Invalid operation type: ${op.type}`;
    if (!op.payload || typeof op.payload !== "object") return "Operation missing 'payload' object.";
    return null;
}
