// ============================================================
// CHRONICAI RESPONSE NETWORK — OPERATIONS DOMAIN MODEL
// Resource, Mission entities and lifecycle transitions
// ============================================================

export const ResourceType = Object.freeze({
    AMBULANCE: "AMBULANCE",
    RESCUE_TEAM: "RESCUE_TEAM",
    BOAT: "BOAT",
    SHELTER: "SHELTER",
    FIRE_ENGINE: "FIRE_ENGINE",
    SUPPLY: "SUPPLY",
    VOLUNTEER_UNIT: "VOLUNTEER_UNIT"
});

export const ResourceStatus = Object.freeze({
    AVAILABLE: "AVAILABLE",
    DISPATCHED: "DISPATCHED",
    MAINTENANCE: "MAINTENANCE",
    OFFLINE: "OFFLINE"
});

export const MissionStatus = Object.freeze({
    ASSIGNED: "ASSIGNED",
    EN_ROUTE: "EN_ROUTE",
    ARRIVED: "ARRIVED",
    IN_PROGRESS: "IN_PROGRESS",
    COMPLETED: "COMPLETED",
    BLOCKED: "BLOCKED",
    CANCELLED: "CANCELLED"
});

const ALLOWED_MISSION_TRANSITIONS = {
    [MissionStatus.ASSIGNED]: [
        MissionStatus.EN_ROUTE,
        MissionStatus.ARRIVED,
        MissionStatus.BLOCKED,
        MissionStatus.CANCELLED
    ],
    [MissionStatus.EN_ROUTE]: [
        MissionStatus.ARRIVED,
        MissionStatus.BLOCKED,
        MissionStatus.CANCELLED
    ],
    [MissionStatus.ARRIVED]: [
        MissionStatus.IN_PROGRESS,
        MissionStatus.BLOCKED,
        MissionStatus.COMPLETED
    ],
    [MissionStatus.IN_PROGRESS]: [
        MissionStatus.COMPLETED,
        MissionStatus.BLOCKED
    ],
    [MissionStatus.BLOCKED]: [
        MissionStatus.EN_ROUTE,
        MissionStatus.IN_PROGRESS,
        MissionStatus.CANCELLED
    ],
    [MissionStatus.COMPLETED]: [],
    [MissionStatus.CANCELLED]: []
};

export function canTransitionMission(currentStatus, nextStatus) {
    if (!currentStatus || !nextStatus) return false;
    if (currentStatus === nextStatus) return true;
    const allowed = ALLOWED_MISSION_TRANSITIONS[currentStatus] || [];
    return allowed.includes(nextStatus);
}

export function generateResourceId(type = "RES") {
    const prefix = String(type).slice(0, 3).toUpperCase();
    const entropy = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}-${entropy}`;
}

export function generateMissionId() {
    const entropy = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `MSN-${entropy}`;
}

export function buildResource({
    id = generateResourceId(),
    name = "Emergency Unit",
    type = ResourceType.RESCUE_TEAM,
    status = ResourceStatus.AVAILABLE,
    capabilities = [],
    capacity = 4,
    location = {},
    contact = ""
}) {
    return {
        id,
        name: String(name).slice(0, 150),
        type: ResourceType[type] || ResourceType.RESCUE_TEAM,
        status: ResourceStatus[status] || ResourceStatus.AVAILABLE,
        capabilities: Array.isArray(capabilities) ? capabilities.map(String) : [],
        capacity: Math.max(1, parseInt(capacity, 10) || 1),
        location: {
            latitude: Number.isFinite(Number(location.latitude ?? location.lat)) ? Number(location.latitude ?? location.lat) : null,
            longitude: Number.isFinite(Number(location.longitude ?? location.lng)) ? Number(location.longitude ?? location.lng) : null,
            address: String(location.address || location.text || "").trim(),
            ward: location.ward ? String(location.ward).trim() : null
        },
        contact: String(contact).trim(),
        lastSeenAt: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now()
    };
}

export function buildMission({
    id = generateMissionId(),
    incidentId,
    resourceId,
    assignedTo = "field_responder_1",
    status = MissionStatus.ASSIGNED,
    etaMinutes = 10,
    routeRisk = "MEDIUM",
    notes = "",
    dispatchedBy = "officer"
}) {
    const now = Date.now();
    return {
        id,
        incidentId,
        resourceId,
        assignedTo,
        status: MissionStatus[status] || MissionStatus.ASSIGNED,
        etaMinutes: Math.max(1, parseInt(etaMinutes, 10) || 10),
        routeRisk: ["LOW", "MEDIUM", "HIGH"].includes(String(routeRisk).toUpperCase()) ? String(routeRisk).toUpperCase() : "MEDIUM",
        notes: String(notes).trim(),
        dispatchedBy,
        events: [
            {
                type: "MISSION_DISPATCHED",
                status: MissionStatus.ASSIGNED,
                actor: dispatchedBy,
                timestamp: now,
                notes
            }
        ],
        createdAt: now,
        updatedAt: now
    };
}
