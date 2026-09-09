// ============================================================
// CHRONICAI RESPONSE NETWORK — CANONICAL DOMAIN MODEL
// Incident, Report, Event types and state transition lifecycle
// ============================================================

export const IncidentStatus = Object.freeze({
    REPORTED: "REPORTED",
    AI_ANALYZED: "AI_ANALYZED",
    NEEDS_VERIFICATION: "NEEDS_VERIFICATION",
    VERIFIED: "VERIFIED",
    PRIORITIZED: "PRIORITIZED",
    RESOURCE_RECOMMENDED: "RESOURCE_RECOMMENDED",
    ASSIGNED: "ASSIGNED",
    IN_PROGRESS: "IN_PROGRESS",
    RESOLVED: "RESOLVED",
    REJECTED: "REJECTED",
    DUPLICATE: "DUPLICATE",
    ESCALATED: "ESCALATED",
    BLOCKED: "BLOCKED"
});

export const PriorityTier = Object.freeze({
    P1: "P1", // Immediate Life Threat (Ack < 60s, Assign < 2min, Dispatch Immediate)
    P2: "P2", // Urgent / Severe (Ack < 5min, Assign < 10min)
    P3: "P3", // Standard Civic / Operational (Ack < 2hr, Resolve < 24-48hr)
    P4: "P4"  // Routine (Ack < 6hr, Resolve < 72+hr)
});

export const IncidentEventType = Object.freeze({
    INCIDENT_CREATED: "INCIDENT_CREATED",
    REPORT_LINKED: "REPORT_LINKED",
    AI_ANALYSIS_COMPLETED: "AI_ANALYSIS_COMPLETED",
    VERIFICATION_COMPLETED: "VERIFICATION_COMPLETED",
    INCIDENT_REJECTED: "INCIDENT_REJECTED",
    PRIORITY_CALCULATED: "PRIORITY_CALCULATED",
    PRIORITY_OVERRIDDEN: "PRIORITY_OVERRIDDEN",
    INCIDENT_MERGED: "INCIDENT_MERGED",
    RESOURCE_RECOMMENDED: "RESOURCE_RECOMMENDED",
    MISSION_ASSIGNED: "MISSION_ASSIGNED",
    STATUS_UPDATED: "STATUS_UPDATED",
    OFFLINE_SYNC_APPLIED: "OFFLINE_SYNC_APPLIED"
});

// Allowed lifecycle state transitions
const ALLOWED_TRANSITIONS = {
    [IncidentStatus.REPORTED]: [
        IncidentStatus.AI_ANALYZED,
        IncidentStatus.NEEDS_VERIFICATION,
        IncidentStatus.DUPLICATE,
        IncidentStatus.REJECTED
    ],
    [IncidentStatus.AI_ANALYZED]: [
        IncidentStatus.NEEDS_VERIFICATION,
        IncidentStatus.VERIFIED,
        IncidentStatus.DUPLICATE,
        IncidentStatus.REJECTED
    ],
    [IncidentStatus.NEEDS_VERIFICATION]: [
        IncidentStatus.VERIFIED,
        IncidentStatus.REJECTED,
        IncidentStatus.DUPLICATE
    ],
    [IncidentStatus.VERIFIED]: [
        IncidentStatus.PRIORITIZED,
        IncidentStatus.RESOURCE_RECOMMENDED,
        IncidentStatus.ASSIGNED,
        IncidentStatus.ESCALATED
    ],
    [IncidentStatus.PRIORITIZED]: [
        IncidentStatus.RESOURCE_RECOMMENDED,
        IncidentStatus.ASSIGNED,
        IncidentStatus.ESCALATED
    ],
    [IncidentStatus.RESOURCE_RECOMMENDED]: [
        IncidentStatus.ASSIGNED,
        IncidentStatus.ESCALATED
    ],
    [IncidentStatus.ASSIGNED]: [
        IncidentStatus.IN_PROGRESS,
        IncidentStatus.ESCALATED,
        IncidentStatus.BLOCKED
    ],
    [IncidentStatus.IN_PROGRESS]: [
        IncidentStatus.RESOLVED,
        IncidentStatus.BLOCKED,
        IncidentStatus.ESCALATED
    ],
    [IncidentStatus.BLOCKED]: [
        IncidentStatus.IN_PROGRESS,
        IncidentStatus.ESCALATED,
        IncidentStatus.RESOLVED
    ],
    [IncidentStatus.ESCALATED]: [
        IncidentStatus.ASSIGNED,
        IncidentStatus.IN_PROGRESS,
        IncidentStatus.RESOLVED
    ],
    [IncidentStatus.RESOLVED]: [],
    [IncidentStatus.REJECTED]: [],
    [IncidentStatus.DUPLICATE]: []
};

export function canTransition(currentStatus, nextStatus) {
    if (!currentStatus || !nextStatus) return false;
    if (currentStatus === nextStatus) return true;
    const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];
    return allowed.includes(nextStatus);
}

export function generateIncidentId() {
    const year = new Date().getFullYear();
    const entropy = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `INC-${year}-${entropy}`;
}

export function generateEventId() {
    const timestamp = Date.now().toString(36);
    const entropy = Math.random().toString(36).substring(2, 6);
    return `EVT-${timestamp}-${entropy}`;
}

export function createIncidentEvent({
    type,
    incidentId,
    actor = { id: "system", role: "system", name: "System" },
    payload = {}
}) {
    return {
        eventId: generateEventId(),
        incidentId,
        type,
        actor: {
            id: actor.id || "anonymous",
            role: actor.role || "system",
            name: actor.name || "System"
        },
        payload,
        timestamp: Date.now()
    };
}

export function buildCanonicalIncident({
    incidentId = generateIncidentId(),
    publicId = null,
    title = "Civic Incident",
    description = "",
    category = "General",
    location = {},
    sourceReportIds = [],
    aiAnalysis = null,
    priority = PriorityTier.P3,
    priorityScore = null,
    status = IncidentStatus.REPORTED,
    createdBy = "system"
}) {
    const now = Date.now();
    const shortId = incidentId.split("-").pop() || "0000";
    const resolvedPublicId = publicId || `CHRONIC-${shortId}`;

    const normalizedLocation = {
        text: String(location.text || location.address || "").trim(),
        latitude: Number.isFinite(Number(location.latitude ?? location.lat)) ? Number(location.latitude ?? location.lat) : null,
        longitude: Number.isFinite(Number(location.longitude ?? location.lng)) ? Number(location.longitude ?? location.lng) : null,
        ward: location.ward ? String(location.ward).trim() : null,
        district: location.district ? String(location.district).trim() : null
    };

    const initialEvent = createIncidentEvent({
        type: IncidentEventType.INCIDENT_CREATED,
        incidentId,
        actor: { id: createdBy, role: "system", name: "Incident Intake" },
        payload: { sourceReportIds, initialStatus: status }
    });

    return {
        incidentId,
        publicId: resolvedPublicId,
        title: String(title).slice(0, 200),
        description: String(description).slice(0, 4000),
        category: String(category).slice(0, 100),
        status,
        priority,
        priorityScore: priorityScore || { totalScore: 30, tier: priority, breakdown: {} },
        location: normalizedLocation,
        sourceReportIds: Array.isArray(sourceReportIds) ? [...sourceReportIds] : [],
        assignedResourceIds: [],
        aiAnalysis: aiAnalysis || null,
        verification: {
            verified: false,
            verifiedBy: null,
            verifiedAt: null,
            notes: "",
            overrideReason: null,
            rejectionReason: null
        },
        mergedInto: null,
        events: [initialEvent],
        createdAt: now,
        updatedAt: now
    };
}
