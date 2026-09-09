// ============================================================
// CHRONICAI RESPONSE NETWORK — SYNC API ROUTES
// Idempotent offline batch push, delta pull, and operation status
// ============================================================

import express from "express";
import {
    processSyncPushBatch,
    getSyncPullDelta,
    getSyncOperationById,
    readAllRoadClosures
} from "../services/sync-service.js";

export const syncRouter = express.Router();

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
    const workerId = req.headers["x-worker-id"] || req.query.workerId || "field_worker";
    return { id: String(workerId), role: "field_worker", name: `Responder (${workerId})` };
}

// In-memory idempotency cache for sync push
const syncIdempotencyCache = new Map();

function checkSyncIdempotency(req, res, next) {
    const key = req.headers["idempotency-key"];
    if (!key) return next();

    if (syncIdempotencyCache.has(key)) {
        const cached = syncIdempotencyCache.get(key);
        return res.status(cached.status).json(cached.body);
    }

    const originalJson = res.json.bind(res);
    res.json = (body) => {
        syncIdempotencyCache.set(key, { status: res.statusCode, body });
        return originalJson(body);
    };
    next();
}

// POST /api/sync/push (Batch offline sync push)
syncRouter.post("/push", checkSyncIdempotency, async (req, res) => {
    try {
        const actor = getActor(req);
        const { operations } = req.body;

        if (!operations || !Array.isArray(operations)) {
            return res.status(400).json({
                success: false,
                error: "Request body must contain an 'operations' array."
            });
        }

        const result = await processSyncPushBatch(operations, actor);
        res.status(200).json(result);
    } catch (error) {
        console.error("Sync push error:", error);
        res.status(500).json({ success: false, error: error.message || "Failed to process sync push." });
    }
});

// GET /api/sync/pull (Delta sync pull)
syncRouter.get("/pull", async (req, res) => {
    try {
        const sinceTimestamp = parseInt(req.query.since || req.query.sinceTimestamp, 10) || 0;
        const assignedTo = req.query.assignedTo ? String(req.query.assignedTo).trim() : null;

        const delta = await getSyncPullDelta({ sinceTimestamp, assignedTo });
        res.json(delta);
    } catch (error) {
        console.error("Sync pull error:", error);
        res.status(500).json({ success: false, error: "Failed to fetch sync delta." });
    }
});

// GET /api/sync/status/:operationId
syncRouter.get("/status/:operationId", async (req, res) => {
    try {
        const op = await getSyncOperationById(req.params.operationId);
        if (!op) {
            return res.status(404).json({ success: false, error: `Operation ${req.params.operationId} not found.` });
        }
        res.json({ success: true, operation: op });
    } catch (error) {
        res.status(500).json({ success: false, error: "Failed to fetch operation status." });
    }
});

// GET /api/sync/road-closures
syncRouter.get("/road-closures", async (req, res) => {
    try {
        const closures = await readAllRoadClosures();
        res.json({ success: true, total: closures.length, roadClosures: closures });
    } catch (error) {
        res.status(500).json({ success: false, error: "Failed to fetch road closures." });
    }
});
