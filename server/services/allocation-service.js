// ============================================================
// CHRONICAI RESPONSE NETWORK — TOP-3 RESOURCE ALLOCATION ENGINE
// Multi-criteria optimization: capability match, travel time, capacity & route risk
// ============================================================

import { ResourceStatus, ResourceType } from "../domain/operations.js";
import { calculateDistanceMeters } from "./duplicate-detector.js";

const CATEGORY_REQUIRED_CAPABILITIES = {
    FLOOD_RESCUE: ["WATER_RESCUE", "PATIENT_TRANSPORT", "FIRST_AID", "OXYGEN"],
    FIRE_EMERGENCY: ["FIRE_SUPPRESSION", "HEAVY_CUTTING", "FIRST_AID"],
    BUILDING_COLLAPSE: ["SEARCH_AND_RESCUE", "HEAVY_CUTTING", "FIRST_AID"],
    MEDICAL_EMERGENCY: ["PATIENT_TRANSPORT", "OXYGEN", "FIRST_AID"],
    ROAD_HAZARD: ["TRAFFIC_MANAGEMENT", "DEBRIS_REMOVAL"],
    WATER_LOGGING: ["WATER_PUMPING", "DEBRIS_REMOVAL"],
    GENERAL_EMERGENCY: ["FIRST_AID", "PATIENT_TRANSPORT"]
};

const CATEGORY_PREFERRED_TYPES = {
    FLOOD_RESCUE: [ResourceType.BOAT, ResourceType.RESCUE_TEAM, ResourceType.AMBULANCE],
    FIRE_EMERGENCY: [ResourceType.FIRE_ENGINE, ResourceType.RESCUE_TEAM, ResourceType.AMBULANCE],
    BUILDING_COLLAPSE: [ResourceType.RESCUE_TEAM, ResourceType.AMBULANCE],
    MEDICAL_EMERGENCY: [ResourceType.AMBULANCE, ResourceType.RESCUE_TEAM],
    ROAD_HAZARD: [ResourceType.RESCUE_TEAM, ResourceType.SUPPLY],
    WATER_LOGGING: [ResourceType.RESCUE_TEAM, ResourceType.BOAT],
    GENERAL_EMERGENCY: [ResourceType.RESCUE_TEAM, ResourceType.AMBULANCE]
};

export function estimateEtaMinutes(resourceLocation, incidentLocation) {
    const lat1 = resourceLocation?.latitude;
    const lon1 = resourceLocation?.longitude;
    const lat2 = incidentLocation?.latitude;
    const lon2 = incidentLocation?.longitude;

    const distance = calculateDistanceMeters(lat1, lon1, lat2, lon2);
    if (distance === null) return 12; // Default fallback ETA

    // Average disaster transit speed in urban flood conditions: 30 km/h (~500 meters/min)
    const transitMinutes = Math.ceil(distance / 500);
    const dispatchPrepMinutes = 2;
    return Math.max(3, transitMinutes + dispatchPrepMinutes);
}

export function evaluateResourceForIncident(resource, incident) {
    if (resource.status === ResourceStatus.MAINTENANCE || resource.status === ResourceStatus.OFFLINE) {
        return null; // Unavailable for deployment
    }

    const reasons = [];
    let score = 0;

    // 1. Priority Base Weight
    const priorityScore = incident.priorityScore?.totalScore || (incident.priority === "P1" ? 85 : incident.priority === "P2" ? 60 : 35);
    score += Math.round(priorityScore * 0.4); // Scales 14 - 40 pts

    // 2. Capability & Type Matching
    const cat = String(incident.category || "GENERAL_EMERGENCY").toUpperCase();
    const requiredCaps = CATEGORY_REQUIRED_CAPABILITIES[cat] || CATEGORY_REQUIRED_CAPABILITIES.GENERAL_EMERGENCY;
    const preferredTypes = CATEGORY_PREFERRED_TYPES[cat] || [ResourceType.RESCUE_TEAM, ResourceType.AMBULANCE];

    let capabilityPoints = 0;
    const resCaps = (resource.capabilities || []).map(c => c.toUpperCase());
    const matchedCaps = requiredCaps.filter(c => resCaps.includes(c));

    if (matchedCaps.length > 0) {
        capabilityPoints = Math.min(30, matchedCaps.length * 10);
        reasons.push(`Capability match: ${matchedCaps.join(", ")} (+${capabilityPoints} pts)`);
    }

    if (preferredTypes.includes(resource.type)) {
        capabilityPoints += 10;
        reasons.push(`Optimal vehicle type: ${resource.type} (+10 pts)`);
    }
    score += capabilityPoints;

    // 3. Capacity vs Casualty Demand
    const casualties = Math.max(1, (incident.aiAnalysis?.peopleAtRisk || 0) + (incident.aiAnalysis?.injuredPeople || 0));
    let capacityPoints = 0;
    if (resource.capacity >= casualties) {
        capacityPoints = 15;
        reasons.push(`Adequate capacity (${resource.capacity} seats for ${casualties} victims) (+15 pts)`);
    } else if (resource.capacity > 0) {
        capacityPoints = 8;
        reasons.push(`Partial capacity (${resource.capacity} of ${casualties} victims) (+8 pts)`);
    }
    score += capacityPoints;

    // 4. Travel Time (ETA)
    const etaMinutes = estimateEtaMinutes(resource.location, incident.location);
    const travelPenalty = Math.min(30, etaMinutes * 2);
    score -= travelPenalty;
    reasons.push(`Estimated arrival: ${etaMinutes} min (-${travelPenalty} pts travel time)`);

    // 5. Route Risk & Road Obstructions
    let routeRisk = "LOW";
    if (cat === "FLOOD_RESCUE" || cat === "BUILDING_COLLAPSE") {
        routeRisk = resource.type === ResourceType.BOAT ? "LOW" : "MEDIUM";
    }
    let riskPenalty = 0;
    if (routeRisk === "HIGH") {
        riskPenalty = 20;
        score -= riskPenalty;
        reasons.push("High route obstruction risk (-20 pts)");
    } else if (routeRisk === "MEDIUM") {
        riskPenalty = 10;
        score -= riskPenalty;
        reasons.push("Medium transit risk through flood sector (-10 pts)");
    } else {
        reasons.push("Clear access route identified");
    }

    // 6. Current Workload Status
    if (resource.status === ResourceStatus.DISPATCHED) {
        score -= 25;
        reasons.push("Currently dispatched on active mission (-25 pts)");
    } else {
        score += 10;
        reasons.push("Resource is idle and immediately available (+10 pts)");
    }

    const finalScore = Math.max(0, score);

    return {
        resourceId: resource.id,
        name: resource.name,
        type: resource.type,
        status: resource.status,
        score: finalScore,
        etaMinutes,
        capabilityMatch: matchedCaps.length > 0 || preferredTypes.includes(resource.type),
        matchedCapabilities: matchedCaps,
        capacity: resource.capacity,
        routeRisk,
        location: resource.location,
        reasons
    };
}

export function recommendTopResources(incident, resources, topN = 3) {
    if (!incident || !Array.isArray(resources)) return [];

    const evaluations = [];
    for (const res of resources) {
        const evalResult = evaluateResourceForIncident(res, incident);
        if (evalResult) evaluations.push(evalResult);
    }

    evaluations.sort((a, b) => b.score - a.score || a.etaMinutes - b.etaMinutes);
    return evaluations.slice(0, topN);
}
