// ============================================================
// CHRONICAI RESPONSE NETWORK — RESOURCES API ROUTES
// Resource registry, availability tracking & Top-3 recommendation
// ============================================================

import express from "express";
import {
    readAllResources,
    getResourceById,
    saveResource,
    updateResourceStatus
} from "../services/mission-service.js";
import { getIncidentById } from "../services/incident-service.js";
import { recommendTopResources } from "../services/allocation-service.js";
import { buildResource } from "../domain/operations.js";

export const resourceRouter = express.Router();

// GET /api/resources
resourceRouter.get("/", async (req, res) => {
    try {
        const { type, status } = req.query;
        let resources = await readAllResources();

        if (type) {
            resources = resources.filter(r => r.type?.toUpperCase() === String(type).toUpperCase());
        }
        if (status) {
            resources = resources.filter(r => r.status?.toUpperCase() === String(status).toUpperCase());
        }

        res.json({
            success: true,
            total: resources.length,
            resources
        });
    } catch (error) {
        console.error("List resources error:", error);
        res.status(500).json({ success: false, error: "Failed to fetch resources." });
    }
});

// GET /api/resources/recommend/:incidentId
resourceRouter.get("/recommend/:incidentId", async (req, res) => {
    try {
        const incident = await getIncidentById(req.params.incidentId);
        if (!incident) {
            return res.status(404).json({ success: false, error: `Incident ${req.params.incidentId} not found.` });
        }

        const resources = await readAllResources();
        const topN = parseInt(req.query.limit, 10) || 3;
        const recommendations = recommendTopResources(incident, resources, topN);

        res.json({
            success: true,
            incidentId: incident.incidentId,
            incidentTitle: incident.title,
            incidentCategory: incident.category,
            incidentPriority: incident.priority,
            recommendationCount: recommendations.length,
            recommendations
        });
    } catch (error) {
        console.error("Recommend resources error:", error);
        res.status(500).json({ success: false, error: error.message || "Failed to generate resource recommendations." });
    }
});

// GET /api/resources/:id
resourceRouter.get("/:id", async (req, res) => {
    try {
        const resource = await getResourceById(req.params.id);
        if (!resource) {
            return res.status(404).json({ success: false, error: `Resource ${req.params.id} not found.` });
        }
        res.json({ success: true, resource });
    } catch (error) {
        res.status(500).json({ success: false, error: "Failed to fetch resource." });
    }
});

// POST /api/resources
resourceRouter.post("/", async (req, res) => {
    try {
        const { name, type, capabilities, capacity, location, contact } = req.body;
        if (!name) {
            return res.status(400).json({ success: false, error: "Resource name is required." });
        }

        const resource = buildResource({
            name,
            type,
            capabilities,
            capacity,
            location,
            contact
        });

        await saveResource(resource);
        res.status(201).json({ success: true, resource });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message || "Failed to register resource." });
    }
});

// PATCH /api/resources/:id/status
resourceRouter.patch("/:id/status", async (req, res) => {
    try {
        const { status } = req.body;
        if (!status) {
            return res.status(400).json({ success: false, error: "Status is required." });
        }
        const resource = await updateResourceStatus(req.params.id, status);
        res.json({ success: true, resource });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message || "Failed to update resource status." });
    }
});
