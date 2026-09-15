// ============================================================
// CHRONICAI RESPONSE NETWORK — OFFLINE SYNC SERVICE
// Idempotent operation processing, delta pull, and conflict ledger
// ============================================================

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
    SyncOperationType,
    SyncOperationStatus,
    buildSyncOperation,
    validateSyncOperation
} from "../domain/sync.js";
import {
    getIncidentById,
    saveIncident,
    createIncidentFromReport,
    readAllIncidents
} from "./incident-service.js";
import {
    getMissionById,
    updateMissionStatus,
    readAllMissions,
    readAllResources
} from "./mission-service.js";
import {
    IncidentEventType,
    createIncidentEvent
} from "../domain/incident.js";

import {
    readCollection,
    getItem,
    saveItem,
    saveCollection,
    safeReadJson,
    safeWriteJson
} from "../storage/storage-adapter.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SYNC_OPS_FILE = "sync-operations.json";
const ROAD_CLOSURES_FILE = "road-closures.json";

let adminDatabaseGetter = null;

export function configureSyncStore({ getAdminDatabase, getAdminApp } = {}) {
    if (typeof getAdminDatabase === "function" && typeof getAdminApp === "function") {
        adminDatabaseGetter = () => getAdminDatabase(getAdminApp());
    }
}

// Local filesystem helpers using safe storage adapter
function readJsonLocal(fileName, defaultVal = []) {
    return safeReadJson(fileName, defaultVal);
}

function saveJsonLocal(fileName, data) {
    safeWriteJson(fileName, data);
}

// ============================================================
// SYNC OPERATION PERSISTENCE
// ============================================================

export async function getSyncOperationById(id) {
    if (!id) return null;
    return getItem("syncOperations", id);
}

export async function saveSyncOperationRecord(op) {
    op.updatedAt = Date.now();
    return saveItem("syncOperations", op.id, op);
}

// Road closures storage
export async function saveRoadClosure(closure) {
    closure.id = closure.id || closure.closureId || `rc_${Date.now()}`;
    closure.closureId = closure.closureId || closure.id;
    closure.reportedAt = closure.reportedAt || Date.now();
    return saveItem("roadClosures", closure.closureId, closure);
}

export async function readAllRoadClosures() {
    return readCollection("roadClosures", []);
}

// ============================================================
// IDEMPOTENT SYNC OPERATION APPLICATOR
// ============================================================

export async function applySyncOperation(rawOp, actor = { id: "field_worker", role: "field_worker", name: "Field Worker" }) {
    const validationError = validateSyncOperation(rawOp);
    if (validationError) {
        return {
            operationId: rawOp?.id || "unknown",
            status: SyncOperationStatus.REJECTED,
            error: validationError
        };
    }

    const op = buildSyncOperation(rawOp);

    // 1. Check Idempotency: Has this exact operation already been processed?
    const existing = await getSyncOperationById(op.id);
    if (existing && existing.status === SyncOperationStatus.APPLIED) {
        return {
            operationId: op.id,
            status: SyncOperationStatus.APPLIED,
            replayed: true,
            result: existing.result
        };
    }

    try {
        let result = null;

        switch (op.type) {
            case SyncOperationType.MISSION_STATUS_UPDATE: {
                const mission = await getMissionById(op.entityId);
                if (!mission) {
                    throw new Error(`Mission ${op.entityId} not found.`);
                }
                const targetStatus = op.payload.status;
                const updateRes = await updateMissionStatus({
                    missionId: op.entityId,
                    nextStatus: targetStatus,
                    notes: op.payload.notes || "Offline status sync",
                    actor
                });
                result = { missionId: op.entityId, status: updateRes.mission.status };
                break;
            }

            case SyncOperationType.RECORD_RESCUE: {
                const incident = await getIncidentById(op.entityId);
                if (!incident) throw new Error(`Incident ${op.entityId} not found.`);

                const rescuedCount = Math.max(1, parseInt(op.payload.rescuedCount, 10) || 1);
                incident.rescuedPeople = (incident.rescuedPeople || 0) + rescuedCount;
                incident.updatedAt = Date.now();

                const rescueEvent = createIncidentEvent({
                    type: IncidentEventType.OFFLINE_SYNC_APPLIED,
                    incidentId: incident.incidentId,
                    actor,
                    payload: {
                        operationId: op.id,
                        action: "RECORD_RESCUE",
                        rescuedCount,
                        totalRescued: incident.rescuedPeople,
                        clientCreatedAt: op.clientCreatedAt,
                        notes: op.payload.notes || ""
                    }
                });
                if (!Array.isArray(incident.events)) incident.events = [];
                incident.events.push(rescueEvent);
                await saveIncident(incident);

                result = { incidentId: incident.incidentId, totalRescued: incident.rescuedPeople };
                break;
            }

            case SyncOperationType.REPORT_ROAD_CLOSURE: {
                const closure = await saveRoadClosure({
                    roadName: op.payload.roadName || "Unspecified Road",
                    latitude: op.payload.latitude ?? null,
                    longitude: op.payload.longitude ?? null,
                    reason: op.payload.reason || "Water overflow / debris blockage",
                    incidentId: op.entityId || null,
                    reportedBy: actor.name || actor.id,
                    reportedAt: op.clientCreatedAt || Date.now()
                });

                if (op.entityId) {
                    const incident = await getIncidentById(op.entityId);
                    if (incident) {
                        const closureEvent = createIncidentEvent({
                            type: IncidentEventType.OFFLINE_SYNC_APPLIED,
                            incidentId: incident.incidentId,
                            actor,
                            payload: {
                                operationId: op.id,
                                action: "ROAD_CLOSURE",
                                closureId: closure.id,
                                roadName: closure.roadName,
                                reason: closure.reason
                            }
                        });
                        incident.events.push(closureEvent);
                        await saveIncident(incident);
                    }
                }
                result = { closureId: closure.id, roadName: closure.roadName };
                break;
            }

            case SyncOperationType.OFFLINE_REPORT_CREATE: {
                const report = {
                    reportId: op.entityId || `REP-OFF-${Date.now()}`,
                    description: op.payload.description || "Offline field report",
                    category: op.payload.category || "General",
                    location: op.payload.location || "",
                    latitude: op.payload.latitude ?? null,
                    longitude: op.payload.longitude ?? null,
                    offlineCreated: true,
                    reporter: { phone: op.payload.phone || "field-worker" }
                };
                const incident = await createIncidentFromReport(report, { actor });
                result = { incidentId: incident.incidentId, reportId: report.reportId };
                break;
            }

            case SyncOperationType.FIELD_NOTE_ADDED: {
                if (op.entityId.startsWith("INC-") || op.entityId.startsWith("CHRONIC-")) {
                    const incident = await getIncidentById(op.entityId);
                    if (incident) {
                        const noteEvent = createIncidentEvent({
                            type: IncidentEventType.OFFLINE_SYNC_APPLIED,
                            incidentId: incident.incidentId,
                            actor,
                            payload: {
                                operationId: op.id,
                                action: "FIELD_NOTE",
                                note: op.payload.note || "",
                                timestamp: op.clientCreatedAt
                            }
                        });
                        incident.events.push(noteEvent);
                        await saveIncident(incident);
                    }
                }
                result = { entityId: op.entityId, noteAdded: true };
                break;
            }

            default:
                throw new Error(`Unsupported operation type: ${op.type}`);
        }

        op.status = SyncOperationStatus.APPLIED;
        op.result = result;
        await saveSyncOperationRecord(op);

        return {
            operationId: op.id,
            status: SyncOperationStatus.APPLIED,
            result
        };
    } catch (error) {
        console.warn(`Sync operation ${op.id} application conflict/error:`, error.message);

        // Detect if this is a lifecycle conflict
        const isConflict = /transition|already|conflict/i.test(error.message);
        op.status = isConflict ? SyncOperationStatus.CONFLICT : SyncOperationStatus.REJECTED;
        op.conflictReason = error.message;
        await saveSyncOperationRecord(op);

        return {
            operationId: op.id,
            status: op.status,
            error: error.message
        };
    }
}

// ============================================================
// BATCH PUSH PROCESSOR
// ============================================================

export async function processSyncPushBatch(operations = [], actor) {
    if (!Array.isArray(operations)) {
        throw new Error("Payload 'operations' must be an array.");
    }

    const results = [];
    for (const rawOp of operations) {
        const res = await applySyncOperation(rawOp, actor);
        results.push(res);
    }

    const appliedCount = results.filter(r => r.status === SyncOperationStatus.APPLIED).length;
    const conflictCount = results.filter(r => r.status === SyncOperationStatus.CONFLICT).length;
    const rejectedCount = results.filter(r => r.status === SyncOperationStatus.REJECTED).length;

    return {
        success: true,
        totalReceived: operations.length,
        applied: appliedCount,
        conflicts: conflictCount,
        rejected: rejectedCount,
        results
    };
}

// ============================================================
// DELTA SYNC PULL
// ============================================================

export async function getSyncPullDelta({ sinceTimestamp = 0, assignedTo = null } = {}) {
    const since = Number(sinceTimestamp) || 0;

    const allIncidents = await readAllIncidents();
    const allMissions = await readAllMissions();
    const allResources = await readAllResources();
    const allRoadClosures = await readAllRoadClosures();

    const incidents = allIncidents.filter(i => (i.updatedAt || i.createdAt || 0) > since);
    let missions = allMissions.filter(m => (m.updatedAt || m.createdAt || 0) > since);
    if (assignedTo) {
        missions = missions.filter(m => m.assignedTo === assignedTo);
    }
    const resources = allResources.filter(r => (r.updatedAt || r.createdAt || 0) > since);
    const roadClosures = allRoadClosures.filter(rc => (rc.reportedAt || 0) > since);

    return {
        success: true,
        serverTime: Date.now(),
        sinceTimestamp: since,
        delta: {
            incidents,
            missions,
            resources,
            roadClosures
        }
    };
}
