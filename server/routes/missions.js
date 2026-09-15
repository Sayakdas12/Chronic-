// ============================================================
// CHRONICAI RESPONSE NETWORK — MISSIONS API ROUTES
// Mission dispatching, field execution, and status synchronization
// ============================================================

import express from "express";
import {
    readAllMissions,
    getMissionById,
    createMission,
    updateMissionStatus
} from "../services/mission-service.js";
import { requireRole, requireAuth } from "../middleware/auth-middleware.js";

export const missionRouter = express.Router();

function getActor(req) {
    if (req.user) {
        return {
            id: req.user.uid || "user",
            role: req.user.role || "field_worker",
            name: req.user.name || req.user.email || "Authenticated User"
        };
    }
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
    return { id: "field-responder", role: "field_worker", name: "Field Responder" };
}

// In-memory idempotency cache for missions
const missionIdempotencyCache = new Map();

function checkMissionIdempotency(req, res, next) {
    const key = req.headers["idempotency-key"];
    if (!key) return next();

    if (missionIdempotencyCache.has(key)) {
        const cached = missionIdempotencyCache.get(key);
        return res.status(cached.status).json(cached.body);
    }

    const originalJson = res.json.bind(res);
    res.json = (body) => {
        missionIdempotencyCache.set(key, { status: res.statusCode, body });
        return originalJson(body);
    };
    next();
}

// GET /api/missions
missionRouter.get("/", async (req, res) => {
    try {
        const { incidentId, resourceId, status, assignedTo } = req.query;
        let missions = await readAllMissions();

        if (incidentId) missions = missions.filter(m => m.incidentId === incidentId);
        if (resourceId) missions = missions.filter(m => m.resourceId === resourceId);
        if (status) missions = missions.filter(m => m.status === status.toUpperCase());
        if (assignedTo) missions = missions.filter(m => m.assignedTo === assignedTo);

        res.json({
            success: true,
            total: missions.length,
            missions
        });
    } catch (error) {
        console.error("List missions error:", error);
        res.status(500).json({ success: false, error: "Failed to fetch missions." });
    }
});

// GET /api/missions/:id
missionRouter.get("/:id", async (req, res) => {
    try {
        const mission = await getMissionById(req.params.id);
        if (!mission) {
            return res.status(404).json({ success: false, error: `Mission ${req.params.id} not found.` });
        }
        res.json({ success: true, mission });
    } catch (error) {
        res.status(500).json({ success: false, error: "Failed to fetch mission." });
    }
});

// POST /api/missions (Dispatch resource to incident)
missionRouter.post("/", requireRole(["admin", "government_officer"]), checkMissionIdempotency, async (req, res) => {
    try {
        const actor = getActor(req);
        const {
            incidentId,
            resourceId,
            assignedTo = "field_worker_1",
            etaMinutes = 10,
            routeRisk = "MEDIUM",
            notes = ""
        } = req.body;

        const result = await createMission({
            incidentId,
            resourceId,
            assignedTo,
            etaMinutes,
            routeRisk,
            notes,
            actor
        });

        res.status(201).json({
            success: true,
            message: `Mission ${result.mission.id} dispatched successfully.`,
            mission: result.mission,
            resource: result.resource,
            incident: result.incident
        });
    } catch (error) {
        console.error("Create mission error:", error);
        res.status(400).json({ success: false, error: error.message || "Failed to dispatch mission." });
    }
});

// PATCH /api/missions/:id/status (Progress mission: EN_ROUTE, ARRIVED, IN_PROGRESS, COMPLETED, BLOCKED)
missionRouter.patch("/:id/status", requireRole(["responder", "field_worker", "admin", "government_officer"]), checkMissionIdempotency, async (req, res) => {
    try {
        const actor = getActor(req);
        const { status, notes = "" } = req.body;

        if (!status) {
            return res.status(400).json({ success: false, error: "Target status is required." });
        }

        const result = await updateMissionStatus({
            missionId: req.params.id,
            nextStatus: String(status).toUpperCase(),
            notes,
            actor
        });

        res.json({
            success: true,
            message: `Mission ${result.mission.id} transitioned to ${result.mission.status}.`,
            mission: result.mission,
            resource: result.resource,
            incident: result.incident
        });
    } catch (error) {
        console.error("Update mission status error:", error);
        res.status(400).json({ success: false, error: error.message || "Failed to update mission status." });
    }
});
