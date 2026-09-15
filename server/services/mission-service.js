// ============================================================
// CHRONICAI RESPONSE NETWORK — MISSION & RESOURCE DISPATCH SERVICE
// Authoritative persistence in Firebase RTDB with JSON fallback
// ============================================================

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
    ResourceType,
    ResourceStatus,
    MissionStatus,
    buildResource,
    buildMission,
    canTransitionMission
} from "../domain/operations.js";
import {
    getIncidentById,
    saveIncident,
    appendIncidentEvent
} from "./incident-service.js";
import { IncidentStatus, IncidentEventType, createIncidentEvent } from "../domain/incident.js";

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
const RESOURCES_FILE = "resources.json";
const MISSIONS_FILE = "missions.json";

let adminDatabaseGetter = null;

export function configureOperationsStore({ getAdminDatabase, getAdminApp } = {}) {
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
// RESOURCE MANAGEMENT
// ============================================================

export async function readAllResources() {
    const resources = await readCollection("resources", []);
    if (!resources || resources.length === 0) {
        return seedDefaultResources();
    }
    return resources;
}

export async function saveResource(resource) {
    if (!resource || !resource.id) throw new Error("Invalid resource payload.");
    resource.updatedAt = Date.now();
    return saveItem("resources", resource.id, resource);
}

export async function getResourceById(id) {
    if (!id) return null;
    return getItem("resources", id);
}

export async function updateResourceStatus(resourceId, status) {
    const resource = await getResourceById(resourceId);
    if (!resource) throw new Error(`Resource ${resourceId} not found.`);
    resource.status = ResourceStatus[status] || status;
    resource.lastSeenAt = Date.now();
    await saveResource(resource);
    return resource;
}

// Seed default fleet matching hackathon disaster scenario
export async function seedDefaultResources() {
    const defaults = [
        buildResource({
            id: "ambulance_a12",
            name: "Ambulance A-12",
            type: ResourceType.AMBULANCE,
            status: ResourceStatus.AVAILABLE,
            capabilities: ["OXYGEN", "FIRST_AID", "PATIENT_TRANSPORT"],
            capacity: 4,
            location: { latitude: 22.5710, longitude: 88.3620, address: "Ward 7 Central Hospital", ward: "Ward 7" }
        }),
        buildResource({
            id: "ambulance_a09",
            name: "Ambulance A-09",
            type: ResourceType.AMBULANCE,
            status: ResourceStatus.AVAILABLE,
            capabilities: ["FIRST_AID", "PATIENT_TRANSPORT"],
            capacity: 3,
            location: { latitude: 22.5850, longitude: 88.3750, address: "Sector 2 Health Post", ward: "Ward 7" }
        }),
        buildResource({
            id: "rescue_r04",
            name: "Rescue Team R-04",
            type: ResourceType.RESCUE_TEAM,
            status: ResourceStatus.AVAILABLE,
            capabilities: ["WATER_RESCUE", "SEARCH_AND_RESCUE", "HEAVY_CUTTING", "FIRST_AID"],
            capacity: 8,
            location: { latitude: 22.5740, longitude: 88.3680, address: "Disaster Management Base 1", ward: "Ward 7" }
        }),
        buildResource({
            id: "boat_b02",
            name: "Rescue Boat B-02",
            type: ResourceType.BOAT,
            status: ResourceStatus.AVAILABLE,
            capabilities: ["WATER_RESCUE", "PATIENT_TRANSPORT", "FOOD_SUPPLY"],
            capacity: 6,
            location: { latitude: 22.5760, longitude: 88.3610, address: "Riverbank Depot", ward: "Ward 7" }
        }),
        buildResource({
            id: "shelter_s01",
            name: "Ward 7 Evacuation Shelter",
            type: ResourceType.SHELTER,
            status: ResourceStatus.AVAILABLE,
            capabilities: ["BEDS", "FOOD_SUPPLY", "FIRST_AID", "CLEAN_WATER"],
            capacity: 120,
            location: { latitude: 22.5680, longitude: 88.3650, address: "Community Hall Ward 7", ward: "Ward 7" }
        })
    ];

    for (const res of defaults) {
        await saveResource(res);
    }
    return defaults;
}

// ============================================================
// MISSION MANAGEMENT
// ============================================================

export async function readAllMissions() {
    return readCollection("missions", []);
}

export async function saveMission(mission) {
    if (!mission || !mission.id) throw new Error("Invalid mission payload.");
    mission.updatedAt = Date.now();
    return saveItem("missions", mission.id, mission);
}

export async function getMissionById(id) {
    if (!id) return null;
    return getItem("missions", id);
}

export async function createMission({
    incidentId,
    resourceId,
    assignedTo = "field_worker_1",
    etaMinutes = 10,
    routeRisk = "MEDIUM",
    notes = "",
    actor = { id: "officer", role: "government_officer", name: "Officer" }
}) {
    if (!incidentId || !resourceId) {
        throw new Error("incidentId and resourceId are required to dispatch a mission.");
    }

    const incident = await getIncidentById(incidentId);
    if (!incident) throw new Error(`Incident ${incidentId} not found.`);

    const resource = await getResourceById(resourceId);
    if (!resource) throw new Error(`Resource ${resourceId} not found.`);

    if (resource.status === ResourceStatus.MAINTENANCE || resource.status === ResourceStatus.OFFLINE) {
        throw new Error(`Resource ${resource.name} is currently ${resource.status} and cannot be assigned.`);
    }

    // 1. Create Mission entity
    const mission = buildMission({
        incidentId,
        resourceId,
        assignedTo,
        status: MissionStatus.ASSIGNED,
        etaMinutes,
        routeRisk,
        notes,
        dispatchedBy: actor.name || actor.id
    });

    // 2. Lock resource to DISPATCHED
    resource.status = ResourceStatus.DISPATCHED;
    resource.activeMissionId = mission.id;
    await saveResource(resource);

    // 3. Update Incident state and emit audit event
    incident.status = IncidentStatus.ASSIGNED;
    if (!Array.isArray(incident.assignedResourceIds)) incident.assignedResourceIds = [];
    if (!incident.assignedResourceIds.includes(resourceId)) {
        incident.assignedResourceIds.push(resourceId);
    }

    const msnEvent = createIncidentEvent({
        type: IncidentEventType.MISSION_ASSIGNED,
        incidentId,
        actor,
        payload: {
            missionId: mission.id,
            resourceId,
            resourceName: resource.name,
            assignedTo,
            etaMinutes,
            routeRisk
        }
    });
    if (!Array.isArray(incident.events)) incident.events = [];
    incident.events.push(msnEvent);
    await saveIncident(incident);

    await saveMission(mission);
    return { mission, resource, incident };
}

export async function updateMissionStatus({
    missionId,
    nextStatus,
    notes = "",
    actor = { id: "field_worker", role: "field_worker", name: "Responder" }
}) {
    const mission = await getMissionById(missionId);
    if (!mission) throw new Error(`Mission ${missionId} not found.`);

    if (!canTransitionMission(mission.status, nextStatus)) {
        throw new Error(`Invalid mission transition from ${mission.status} to ${nextStatus}.`);
    }

    const previousStatus = mission.status;
    mission.status = nextStatus;
    mission.notes = notes || mission.notes;
    mission.updatedAt = Date.now();

    mission.events.push({
        type: "MISSION_STATUS_UPDATED",
        status: nextStatus,
        previousStatus,
        actor: actor.name || actor.id,
        timestamp: Date.now(),
        notes
    });

    await saveMission(mission);

    // Coordinate incident and resource states
    const incident = await getIncidentById(mission.incidentId);
    const resource = await getResourceById(mission.resourceId);

    if (nextStatus === MissionStatus.ARRIVED) {
        if (incident && (incident.status === IncidentStatus.ASSIGNED || incident.status === IncidentStatus.NEEDS_VERIFICATION || incident.status === IncidentStatus.PRIORITIZED)) {
            incident.status = IncidentStatus.IN_PROGRESS;
            const statusEvt = createIncidentEvent({
                type: IncidentEventType.STATUS_UPDATED,
                incidentId: mission.incidentId,
                actor,
                payload: { missionId, status: "IN_PROGRESS", note: "Responders arrived on scene." }
            });
            if (!Array.isArray(incident.events)) incident.events = [];
            incident.events.push(statusEvt);
            await saveIncident(incident);
        }
    } else if (nextStatus === MissionStatus.COMPLETED) {
        // Release resource back to AVAILABLE
        if (resource) {
            resource.status = ResourceStatus.AVAILABLE;
            resource.activeMissionId = null;
            await saveResource(resource);
        }

        if (incident && incident.status !== IncidentStatus.RESOLVED) {
            incident.status = IncidentStatus.RESOLVED;
            const resEvt = createIncidentEvent({
                type: IncidentEventType.STATUS_UPDATED,
                incidentId: mission.incidentId,
                actor,
                payload: { missionId, status: "RESOLVED", note: "Mission completed. Scene secured." }
            });
            if (!Array.isArray(incident.events)) incident.events = [];
            incident.events.push(resEvt);
            await saveIncident(incident);
        }
    } else if (nextStatus === MissionStatus.CANCELLED) {
        // Release resource
        if (resource) {
            resource.status = ResourceStatus.AVAILABLE;
            resource.activeMissionId = null;
            await saveResource(resource);
        }
    }

    return { mission, resource, incident };
}
