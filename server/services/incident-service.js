// ============================================================
// CHRONICAI RESPONSE NETWORK — INCIDENT SERVICE
// Authoritative persistence in Firebase RTDB with JSON fallback
// ============================================================

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
    IncidentStatus,
    PriorityTier,
    IncidentEventType,
    buildCanonicalIncident,
    createIncidentEvent,
    canTransition
} from "../domain/incident.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const INCIDENTS_FILE = path.join(__dirname, "..", "..", "data", "incidents.json");

let adminDatabaseGetter = null;

export function configureIncidentStore({ getAdminDatabase, getAdminApp }) {
    if (typeof getAdminDatabase === "function" && typeof getAdminApp === "function") {
        adminDatabaseGetter = () => getAdminDatabase(getAdminApp());
    }
}

function isFirebaseStoreEnabled() {
    const hasJson = Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    const hasFile = Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_FILE && fs.existsSync(process.env.FIREBASE_SERVICE_ACCOUNT_FILE));
    return Boolean(
        adminDatabaseGetter &&
        process.env.FIREBASE_DATABASE_URL &&
        (hasJson || hasFile)
    );
}

// Local filesystem fallback
function readIncidentsLocal() {
    try {
        if (!fs.existsSync(INCIDENTS_FILE)) {
            fs.mkdirSync(path.dirname(INCIDENTS_FILE), { recursive: true });
            fs.writeFileSync(INCIDENTS_FILE, "[]", "utf-8");
            return [];
        }
        const raw = fs.readFileSync(INCIDENTS_FILE, "utf-8").trim();
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.warn("Failed reading local incidents.json:", error.message);
        return [];
    }
}

function saveIncidentsLocal(incidents) {
    try {
        fs.mkdirSync(path.dirname(INCIDENTS_FILE), { recursive: true });
        const tempPath = `${INCIDENTS_FILE}.${process.pid}.${Date.now()}.tmp`;
        fs.writeFileSync(tempPath, JSON.stringify(incidents, null, 2), "utf-8");
        try {
            fs.renameSync(tempPath, INCIDENTS_FILE);
        } catch {
            fs.copyFileSync(tempPath, INCIDENTS_FILE);
            fs.unlinkSync(tempPath);
        }
    } catch (error) {
        console.error("Failed saving local incidents.json:", error.message);
    }
}

export async function readAllIncidents() {
    if (isFirebaseStoreEnabled()) {
        try {
            const db = adminDatabaseGetter();
            const snapshot = await db.ref("incidents").once("value");
            const val = snapshot.val();
            if (!val) return [];
            return Array.isArray(val) ? val.filter(Boolean) : Object.values(val);
        } catch (error) {
            console.warn("Firebase RTDB incidents read error, using local fallback:", error.message);
        }
    }
    return readIncidentsLocal();
}

export async function saveIncident(incident) {
    if (!incident || !incident.incidentId) {
        throw new Error("Invalid incident payload: missing incidentId.");
    }
    incident.updatedAt = Date.now();

    if (isFirebaseStoreEnabled()) {
        try {
            const db = adminDatabaseGetter();
            await db.ref(`incidents/${incident.incidentId}`).set(incident);
            return incident;
        } catch (error) {
            console.warn("Firebase RTDB incident save failed, falling back to local:", error.message);
        }
    }

    const incidents = readIncidentsLocal();
    const index = incidents.findIndex((item) => item.incidentId === incident.incidentId);
    if (index >= 0) {
        incidents[index] = incident;
    } else {
        incidents.unshift(incident);
    }
    saveIncidentsLocal(incidents);
    return incident;
}

export async function getIncidentById(incidentId) {
    if (!incidentId) return null;

    if (isFirebaseStoreEnabled()) {
        try {
            const db = adminDatabaseGetter();
            const snapshot = await db.ref(`incidents/${incidentId}`).once("value");
            if (snapshot.exists()) return snapshot.val();
        } catch (error) {
            console.warn("Firebase RTDB getIncidentById failed, falling back to local:", error.message);
        }
    }

    const incidents = readIncidentsLocal();
    return incidents.find((item) => item.incidentId === incidentId || item.publicId === incidentId) || null;
}

export async function listIncidents({
    status,
    priority,
    category,
    search,
    limit = 100,
    offset = 0
} = {}) {
    const all = await readAllIncidents();
    const query = search ? String(search).toLowerCase().trim() : null;

    let filtered = all.filter((item) => {
        if (status && item.status !== status) return false;
        if (priority && item.priority !== priority) return false;
        if (category && item.category?.toLowerCase() !== category.toLowerCase()) return false;
        if (query) {
            const searchable = `${item.incidentId} ${item.publicId} ${item.title} ${item.description} ${item.location?.text || ""}`.toLowerCase();
            if (!searchable.includes(query)) return false;
        }
        return true;
    });

    filtered.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
    const total = filtered.length;
    const paginated = filtered.slice(offset, offset + limit);

    return { total, incidents: paginated };
}

export async function appendIncidentEvent(incidentId, { type, actor, payload }) {
    const incident = await getIncidentById(incidentId);
    if (!incident) throw new Error(`Incident ${incidentId} not found.`);

    const event = createIncidentEvent({
        type,
        incidentId,
        actor,
        payload
    });

    if (!Array.isArray(incident.events)) incident.events = [];
    incident.events.push(event);
    incident.updatedAt = Date.now();

    await saveIncident(incident);
    return event;
}

export async function updateIncidentStatus(incidentId, nextStatus, actor = { id: "system", role: "system" }, notes = "") {
    const incident = await getIncidentById(incidentId);
    if (!incident) throw new Error(`Incident ${incidentId} not found.`);

    if (!canTransition(incident.status, nextStatus)) {
        throw new Error(`Invalid lifecycle transition from ${incident.status} to ${nextStatus}.`);
    }

    const previousStatus = incident.status;
    incident.status = nextStatus;
    incident.updatedAt = Date.now();

    const event = createIncidentEvent({
        type: IncidentEventType.STATUS_UPDATED,
        incidentId,
        actor,
        payload: { previousStatus, nextStatus, notes }
    });
    incident.events.push(event);

    await saveIncident(incident);
    return incident;
}

export async function mergeIncidents({
    primaryIncidentId,
    duplicateIncidentId,
    actor = { id: "officer", role: "government_officer" },
    reason = "Duplicate incident detected and merged by officer"
}) {
    if (primaryIncidentId === duplicateIncidentId) {
        throw new Error("Cannot merge an incident into itself.");
    }

    const primary = await getIncidentById(primaryIncidentId);
    if (!primary) throw new Error(`Primary incident ${primaryIncidentId} not found.`);

    const duplicate = await getIncidentById(duplicateIncidentId);
    if (!duplicate) throw new Error(`Duplicate incident ${duplicateIncidentId} not found.`);

    // Merge source reports
    const combinedReportIds = Array.from(new Set([
        ...(primary.sourceReportIds || []),
        ...(duplicate.sourceReportIds || [])
    ]));
    primary.sourceReportIds = combinedReportIds;

    // Mark duplicate
    duplicate.status = IncidentStatus.DUPLICATE;
    duplicate.mergedInto = primaryIncidentId;
    duplicate.updatedAt = Date.now();

    const mergeEventPrimary = createIncidentEvent({
        type: IncidentEventType.INCIDENT_MERGED,
        incidentId: primaryIncidentId,
        actor,
        payload: {
            mergedDuplicateId: duplicateIncidentId,
            reason,
            totalLinkedReports: combinedReportIds.length
        }
    });
    primary.events.push(mergeEventPrimary);

    const mergeEventDuplicate = createIncidentEvent({
        type: IncidentEventType.INCIDENT_MERGED,
        incidentId: duplicateIncidentId,
        actor,
        payload: {
            mergedIntoPrimaryId: primaryIncidentId,
            reason
        }
    });
    duplicate.events.push(mergeEventDuplicate);

    await saveIncident(duplicate);
    await saveIncident(primary);

    return { primary, duplicate };
}

export async function createIncidentFromReport(report, { aiAnalysis = null, priorityScore = null, actor = { id: "system", role: "system" } } = {}) {
    if (!report || !report.reportId) {
        throw new Error("Invalid report object.");
    }

    const category = aiAnalysis?.category || report.analysis?.category || report.category || "General";
    const title = aiAnalysis?.summary ? aiAnalysis.summary.slice(0, 100) : (report.analysis?.problem || report.description || "Citizen Report").slice(0, 100);
    const description = report.description || report.analysis?.problemDescription || "";
    const priority = priorityScore?.tier || report.priority || PriorityTier.P3;

    const location = {
        text: report.location || report.analysis?.location || "",
        latitude: report.latitude ?? null,
        longitude: report.longitude ?? null,
        ward: report.ward || null,
        district: report.district || null
    };

    const incident = buildCanonicalIncident({
        title,
        description,
        category,
        location,
        sourceReportIds: [report.reportId],
        aiAnalysis,
        priority,
        priorityScore,
        status: IncidentStatus.NEEDS_VERIFICATION,
        createdBy: actor.id
    });

    await saveIncident(incident);
    return incident;
}
