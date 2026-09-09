// ============================================================
// CHRONICAI RESPONSE NETWORK — INCIDENT API ROUTES
// Canonical incident management, officer verification, merge & priority scoring
// ============================================================

import express from "express";
import {
    IncidentStatus,
    PriorityTier,
    IncidentEventType,
    buildCanonicalIncident,
    createIncidentEvent
} from "../domain/incident.js";
import {
    readAllIncidents,
    getIncidentById,
    listIncidents,
    saveIncident,
    updateIncidentStatus,
    mergeIncidents,
    appendIncidentEvent
} from "../services/incident-service.js";
import { validateAiAnalysis, generateHeuristicFallbackAnalysis } from "../services/ai-validation.js";
import { calculatePriorityScore } from "../services/priority-engine.js";
import { findDuplicateCandidates } from "../services/duplicate-detector.js";

export const incidentRouter = express.Router();

// Middleware helper to extract authenticated actor or local admin
function getActor(req) {
    if (req.governmentUser) {
        return {
            id: req.governmentUser.uid || "officer",
            role: req.governmentUser.role || "government_officer",
            name: req.governmentUser.name || req.governmentUser.email || "Officer"
        };
    }
    if (req.headers["x-local-admin"] === "true") {
        return { id: "local-admin", role: "admin", name: "Local Administrator" };
    }
    return { id: "anonymous", role: "citizen", name: "Public User" };
}

// In-memory idempotency cache for mutating requests
const idempotencyCache = new Map();

function checkIdempotency(req, res, next) {
    const key = req.headers["idempotency-key"];
    if (!key) return next();

    if (idempotencyCache.has(key)) {
        const cached = idempotencyCache.get(key);
        return res.status(cached.status).json(cached.body);
    }

    const originalJson = res.json.bind(res);
    res.json = (body) => {
        idempotencyCache.set(key, { status: res.statusCode, body });
        return originalJson(body);
    };
    next();
}

// ============================================================
// 1. LIST INCIDENTS
// GET /api/incidents
// ============================================================
incidentRouter.get("/", async (req, res) => {
    try {
        const { status, priority, category, q, limit = 50, offset = 0 } = req.query;
        const result = await listIncidents({
            status: status ? String(status).toUpperCase() : undefined,
            priority: priority ? String(priority).toUpperCase() : undefined,
            category: category ? String(category) : undefined,
            search: q,
            limit: Math.min(100, Math.max(1, parseInt(limit, 10) || 50)),
            offset: Math.max(0, parseInt(offset, 10) || 0)
        });

        res.json({
            success: true,
            total: result.total,
            count: result.incidents.length,
            incidents: result.incidents
        });
    } catch (error) {
        console.error("List incidents error:", error);
        res.status(500).json({ success: false, error: "Failed to list incidents." });
    }
});

// ============================================================
// 2. GET SINGLE INCIDENT
// GET /api/incidents/:id
// ============================================================
incidentRouter.get("/:id", async (req, res) => {
    try {
        const incident = await getIncidentById(req.params.id);
        if (!incident) {
            return res.status(404).json({ success: false, error: `Incident ${req.params.id} not found.` });
        }
        res.json({ success: true, incident });
    } catch (error) {
        console.error("Get incident error:", error);
        res.status(500).json({ success: false, error: "Failed to retrieve incident." });
    }
});

// ============================================================
// 3. CREATE CANONICAL INCIDENT
// POST /api/incidents
// ============================================================
incidentRouter.post("/", checkIdempotency, async (req, res) => {
    try {
        const actor = getActor(req);
        const {
            title,
            description,
            category,
            location,
            sourceReportIds = [],
            aiAnalysis: rawAi = null
        } = req.body;

        if (!description && !title) {
            return res.status(400).json({ success: false, error: "Title or description is required." });
        }

        // Validate or generate AI analysis
        let aiAnalysis;
        if (rawAi) {
            aiAnalysis = validateAiAnalysis(rawAi);
        } else {
            aiAnalysis = generateHeuristicFallbackAnalysis({
                description: description || title,
                location: location?.text || "",
                categoryHint: category
            });
        }

        // Calculate initial priority score
        const priorityScore = calculatePriorityScore({
            aiAnalysis,
            peopleAtRisk: aiAnalysis.peopleAtRisk,
            injuredPeople: aiAnalysis.injuredPeople,
            severity: aiAnalysis.priorityRecommendation,
            signals: [...aiAnalysis.urgencySignals, ...aiAnalysis.hazards],
            location,
            sourceReportCount: Math.max(1, sourceReportIds.length)
        });

        const incident = buildCanonicalIncident({
            title: title || aiAnalysis.summary.slice(0, 100),
            description: description || "",
            category: aiAnalysis.category || category || "General",
            location: location || {},
            sourceReportIds,
            aiAnalysis,
            priority: priorityScore.tier,
            priorityScore,
            status: IncidentStatus.NEEDS_VERIFICATION,
            createdBy: actor.id
        });

        await saveIncident(incident);

        res.status(201).json({
            success: true,
            incidentId: incident.incidentId,
            publicId: incident.publicId,
            incident
        });
    } catch (error) {
        console.error("Create incident error:", error);
        res.status(500).json({ success: false, error: error.message || "Failed to create incident." });
    }
});

// ============================================================
// 4. OFFICER VERIFICATION FLOW
// POST /api/incidents/:id/verify
// ============================================================
incidentRouter.post("/:id/verify", checkIdempotency, async (req, res) => {
    try {
        const actor = getActor(req);
        const incident = await getIncidentById(req.params.id);
        if (!incident) {
            return res.status(404).json({ success: false, error: `Incident ${req.params.id} not found.` });
        }

        const { priorityOverride, overrideReason, notes = "" } = req.body;

        // Priority override validation
        let finalPriority = incident.priority;
        let priorityScore = incident.priorityScore;

        if (priorityOverride && PriorityTier[priorityOverride]) {
            if (!overrideReason || String(overrideReason).trim().length < 5) {
                return res.status(400).json({
                    success: false,
                    error: "Officer priority override requires an overrideReason of at least 5 characters."
                });
            }

            priorityScore = calculatePriorityScore({
                aiAnalysis: incident.aiAnalysis,
                peopleAtRisk: incident.aiAnalysis?.peopleAtRisk,
                injuredPeople: incident.aiAnalysis?.injuredPeople,
                signals: [...(incident.aiAnalysis?.urgencySignals || []), ...(incident.aiAnalysis?.hazards || [])],
                location: incident.location,
                sourceReportCount: incident.sourceReportIds.length,
                createdAt: incident.createdAt,
                officerOverride: {
                    tier: priorityOverride,
                    reason: overrideReason
                }
            });
            finalPriority = priorityScore.tier;

            // Emit priority override event
            incident.events.push(createIncidentEvent({
                type: IncidentEventType.PRIORITY_OVERRIDDEN,
                incidentId: incident.incidentId,
                actor,
                payload: {
                    previousPriority: incident.priority,
                    newPriority: finalPriority,
                    overrideReason
                }
            }));
        }

        // Apply verification
        incident.verification = {
            verified: true,
            verifiedBy: actor.id,
            verifiedAt: Date.now(),
            notes: String(notes).trim(),
            overrideReason: overrideReason || null,
            rejectionReason: null
        };

        // Transition: NEEDS_VERIFICATION -> VERIFIED -> PRIORITIZED
        incident.status = IncidentStatus.PRIORITIZED;
        incident.priority = finalPriority;
        incident.priorityScore = priorityScore;
        incident.updatedAt = Date.now();

        incident.events.push(createIncidentEvent({
            type: IncidentEventType.VERIFICATION_COMPLETED,
            incidentId: incident.incidentId,
            actor,
            payload: {
                verifiedPriority: finalPriority,
                notes,
                overrideReason: overrideReason || null
            }
        }));

        await saveIncident(incident);

        res.json({
            success: true,
            message: `Incident ${incident.incidentId} successfully verified and prioritized.`,
            incident
        });
    } catch (error) {
        console.error("Verify incident error:", error);
        res.status(500).json({ success: false, error: error.message || "Failed to verify incident." });
    }
});

// ============================================================
// 5. OFFICER REJECTION FLOW
// POST /api/incidents/:id/reject
// ============================================================
incidentRouter.post("/:id/reject", checkIdempotency, async (req, res) => {
    try {
        const actor = getActor(req);
        const incident = await getIncidentById(req.params.id);
        if (!incident) {
            return res.status(404).json({ success: false, error: `Incident ${req.params.id} not found.` });
        }

        const { rejectionReason, notes = "" } = req.body;
        if (!rejectionReason || String(rejectionReason).trim().length < 5) {
            return res.status(400).json({
                success: false,
                error: "A valid rejectionReason of at least 5 characters is required to reject an incident."
            });
        }

        incident.status = IncidentStatus.REJECTED;
        incident.verification = {
            verified: false,
            verifiedBy: actor.id,
            verifiedAt: Date.now(),
            notes: String(notes).trim(),
            overrideReason: null,
            rejectionReason: String(rejectionReason).trim()
        };
        incident.updatedAt = Date.now();

        incident.events.push(createIncidentEvent({
            type: IncidentEventType.INCIDENT_REJECTED,
            incidentId: incident.incidentId,
            actor,
            payload: { rejectionReason, notes }
        }));

        await saveIncident(incident);

        res.json({
            success: true,
            message: `Incident ${incident.incidentId} rejected.`,
            incident
        });
    } catch (error) {
        console.error("Reject incident error:", error);
        res.status(500).json({ success: false, error: error.message || "Failed to reject incident." });
    }
});

// ============================================================
// 6. DUPLICATE CANDIDATE DETECTION
// GET /api/incidents/:id/duplicate-candidates
// ============================================================
incidentRouter.get("/:id/duplicate-candidates", async (req, res) => {
    try {
        const incident = await getIncidentById(req.params.id);
        if (!incident) {
            return res.status(404).json({ success: false, error: `Incident ${req.params.id} not found.` });
        }

        const allIncidents = await readAllIncidents();
        const threshold = parseInt(req.query.threshold, 10) || 35;
        const candidates = findDuplicateCandidates(incident, allIncidents, threshold);

        res.json({
            success: true,
            incidentId: incident.incidentId,
            candidatesCount: candidates.length,
            candidates
        });
    } catch (error) {
        console.error("Find duplicate candidates error:", error);
        res.status(500).json({ success: false, error: "Failed to search duplicate candidates." });
    }
});

// ============================================================
// 7. NON-DESTRUCTIVE MERGE INCIDENTS
// POST /api/incidents/:id/merge
// ============================================================
incidentRouter.post("/:id/merge", checkIdempotency, async (req, res) => {
    try {
        const actor = getActor(req);
        const primaryIncidentId = req.params.id;
        const { duplicateIncidentId, reason = "Duplicate report merged by authority" } = req.body;

        if (!duplicateIncidentId) {
            return res.status(400).json({ success: false, error: "duplicateIncidentId is required." });
        }

        const { primary, duplicate } = await mergeIncidents({
            primaryIncidentId,
            duplicateIncidentId,
            actor,
            reason
        });

        // Re-calculate priority score with combined corroboration
        const updatedScore = calculatePriorityScore({
            aiAnalysis: primary.aiAnalysis,
            peopleAtRisk: primary.aiAnalysis?.peopleAtRisk,
            injuredPeople: primary.aiAnalysis?.injuredPeople,
            signals: [...(primary.aiAnalysis?.urgencySignals || []), ...(primary.aiAnalysis?.hazards || [])],
            location: primary.location,
            sourceReportCount: primary.sourceReportIds.length,
            createdAt: primary.createdAt
        });

        primary.priorityScore = updatedScore;
        primary.priority = updatedScore.tier;
        await saveIncident(primary);

        res.json({
            success: true,
            message: `Successfully merged duplicate ${duplicateIncidentId} into primary ${primaryIncidentId}.`,
            primary,
            duplicate
        });
    } catch (error) {
        console.error("Merge incidents error:", error);
        res.status(500).json({ success: false, error: error.message || "Failed to merge incidents." });
    }
});

// ============================================================
// 8. PRIORITY CALCULATION (Sandbox & Recalculate)
// POST /api/incidents/:id/priority-score
// ============================================================
incidentRouter.post("/:id/priority-score", async (req, res) => {
    try {
        const incident = await getIncidentById(req.params.id);
        if (!incident) {
            return res.status(404).json({ success: false, error: `Incident ${req.params.id} not found.` });
        }

        const score = calculatePriorityScore({
            aiAnalysis: incident.aiAnalysis,
            peopleAtRisk: req.body.peopleAtRisk ?? incident.aiAnalysis?.peopleAtRisk,
            injuredPeople: req.body.injuredPeople ?? incident.aiAnalysis?.injuredPeople,
            missingPeople: req.body.missingPeople,
            signals: [
                ...(req.body.signals || []),
                ...(incident.aiAnalysis?.urgencySignals || []),
                ...(incident.aiAnalysis?.hazards || [])
            ],
            location: incident.location,
            sourceReportCount: incident.sourceReportIds.length,
            createdAt: incident.createdAt,
            officerOverride: req.body.officerOverride
        });

        incident.priorityScore = score;
        incident.priority = score.tier;
        await saveIncident(incident);

        res.json({ success: true, priorityScore: score, incident });
    } catch (error) {
        console.error("Calculate priority score error:", error);
        res.status(500).json({ success: false, error: error.message || "Failed to calculate priority score." });
    }
});

// Sandbox priority calculator (no incident persistence required)
incidentRouter.post("/calculate-priority", (req, res) => {
    try {
        const score = calculatePriorityScore({
            peopleAtRisk: req.body.peopleAtRisk,
            injuredPeople: req.body.injuredPeople,
            missingPeople: req.body.missingPeople,
            severity: req.body.severity,
            signals: req.body.signals || [],
            location: req.body.location || {},
            sourceReportCount: req.body.sourceReportCount || 1,
            createdAt: req.body.createdAt ? new Date(req.body.createdAt).getTime() : Date.now(),
            officerOverride: req.body.officerOverride
        });
        res.json({ success: true, priorityScore: score });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});
