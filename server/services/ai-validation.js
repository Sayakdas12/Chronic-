// ============================================================
// CHRONICAI RESPONSE NETWORK — AI ANALYSIS & SCHEMA VALIDATION
// Structured output enforcement, safety guardrails, and deterministic NLP fallback
// ============================================================

import { PriorityTier } from "../domain/incident.js";

const VALID_CATEGORIES = [
    "FLOOD_RESCUE",
    "FIRE_EMERGENCY",
    "BUILDING_COLLAPSE",
    "MEDICAL_EMERGENCY",
    "ROAD_HAZARD",
    "WATER_LOGGING",
    "POWER_OUTAGE",
    "SANITATION_WASTE",
    "DRAINAGE_OVERFLOW",
    "CIVIC_INFRASTRUCTURE",
    "GENERAL_EMERGENCY"
];

const CATEGORY_MAP = {
    flood: "FLOOD_RESCUE",
    water: "WATER_LOGGING",
    fire: "FIRE_EMERGENCY",
    collapse: "BUILDING_COLLAPSE",
    medical: "MEDICAL_EMERGENCY",
    road: "ROAD_HAZARD",
    electric: "POWER_OUTAGE",
    power: "POWER_OUTAGE",
    waste: "SANITATION_WASTE",
    garbage: "SANITATION_WASTE",
    drain: "DRAINAGE_OVERFLOW",
    sewer: "DRAINAGE_OVERFLOW"
};

export function normalizeCategory(categoryStr) {
    if (!categoryStr) return "GENERAL_EMERGENCY";
    const cleaned = String(categoryStr).trim().toUpperCase().replace(/[\s-]+/g, "_");
    if (VALID_CATEGORIES.includes(cleaned)) return cleaned;

    const lower = String(categoryStr).toLowerCase();
    for (const [key, mapped] of Object.entries(CATEGORY_MAP)) {
        if (lower.includes(key)) return mapped;
    }
    return "GENERAL_EMERGENCY";
}

export function validateAiAnalysis(raw) {
    if (!raw || typeof raw !== "object") {
        throw new Error("AI output must be a valid JSON object.");
    }

    const category = normalizeCategory(raw.category);

    // Normalize priority recommendation
    let priorityRecommendation = PriorityTier.P3;
    const rawPriority = String(raw.priorityRecommendation || raw.priority || "").toUpperCase();
    if (rawPriority.includes("1") || rawPriority.includes("CRITICAL")) priorityRecommendation = PriorityTier.P1;
    else if (rawPriority.includes("2") || rawPriority.includes("HIGH") || rawPriority.includes("SEVERE")) priorityRecommendation = PriorityTier.P2;
    else if (rawPriority.includes("3") || rawPriority.includes("MEDIUM")) priorityRecommendation = PriorityTier.P3;
    else if (rawPriority.includes("4") || rawPriority.includes("LOW")) priorityRecommendation = PriorityTier.P4;

    // Confidence clamped between 0 and 1
    let confidence = 0.5;
    if (typeof raw.confidence === "number") {
        confidence = Math.max(0, Math.min(1, raw.confidence));
    } else if (typeof raw.confidence === "string") {
        const lower = raw.confidence.toLowerCase();
        if (lower.includes("high")) confidence = 0.9;
        else if (lower.includes("medium")) confidence = 0.65;
        else if (lower.includes("low")) confidence = 0.35;
        else {
            const parsed = parseFloat(raw.confidence);
            if (!isNaN(parsed)) confidence = Math.max(0, Math.min(1, parsed > 1 ? parsed / 100 : parsed));
        }
    }

    const peopleAtRisk = Math.max(0, parseInt(raw.peopleAtRisk, 10) || 0);
    const injuredPeople = Math.max(0, parseInt(raw.injuredPeople, 10) || 0);

    const urgencySignals = Array.isArray(raw.urgencySignals)
        ? raw.urgencySignals.map(String).filter(Boolean).slice(0, 10)
        : [];

    const hazards = Array.isArray(raw.hazards)
        ? raw.hazards.map(String).filter(Boolean).slice(0, 10)
        : [];

    const recommendedResources = Array.isArray(raw.recommendedResources)
        ? raw.recommendedResources.map(String).filter(Boolean).slice(0, 5)
        : [];

    const explanation = Array.isArray(raw.explanation)
        ? raw.explanation.map(String).filter(Boolean).slice(0, 8)
        : (raw.explanation ? [String(raw.explanation)] : []);

    const summary = String(raw.summary || raw.problemDescription || "Analyzed incident report.").trim().slice(0, 1000);

    // Human verification mandatory for P1 and P2
    const requiresHumanVerification = (
        priorityRecommendation === PriorityTier.P1 ||
        priorityRecommendation === PriorityTier.P2 ||
        peopleAtRisk > 0 ||
        injuredPeople > 0 ||
        Boolean(raw.requiresHumanVerification)
    );

    return {
        category,
        priorityRecommendation,
        confidence,
        peopleAtRisk,
        injuredPeople,
        urgencySignals,
        hazards,
        recommendedResources,
        summary,
        explanation,
        requiresHumanVerification,
        advisory: true, // Crucial architectural guardrail: AI is decision-support, not autonomous command
        modelInfo: raw.modelInfo || "gemini-flash",
        validatedAt: Date.now()
    };
}

// Deterministic NLP heuristic fallback when Gemini API is unavailable
export function generateHeuristicFallbackAnalysis({ description = "", location = "", categoryHint = "" }) {
    const text = `${description} ${location} ${categoryHint}`.toLowerCase();

    let category = "GENERAL_EMERGENCY";
    for (const [key, mapped] of Object.entries(CATEGORY_MAP)) {
        if (text.includes(key)) {
            category = mapped;
            break;
        }
    }

    // Signals
    const urgencySignals = [];
    const hazards = [];
    const recommendedResources = [];
    let peopleAtRisk = 0;
    let injuredPeople = 0;

    // Detect people numbers (digits or English words)
    const wordNumbers = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, several: 4, dozens: 20 };
    const peopleMatch = text.match(/(\d+|one|two|three|four|five|six|seven|eight|nine|ten|several)\s*(people|person|victims|elderly|seniors|children|residents|families)/i);
    if (peopleMatch) {
        const token = peopleMatch[1].toLowerCase();
        peopleAtRisk = wordNumbers[token] || parseInt(token, 10) || 1;
    }

    if (/trapped|stranded|surrounded|cannot escape|stuck/i.test(text)) {
        urgencySignals.push("people trapped");
        if (peopleAtRisk === 0) peopleAtRisk = 2;
    }
    if (/injur|bleeding|unconscious|critical|burns/i.test(text)) {
        urgencySignals.push("medical casualties");
        injuredPeople = Math.max(1, injuredPeople);
        recommendedResources.push("AMBULANCE");
    }
    if (/water rising|flood|current|submerged|overflowing/i.test(text)) {
        hazards.push("rising flood water");
        recommendedResources.push("RESCUE_BOAT");
    }
    if (/fire|smoke|explosion|flames/i.test(text)) {
        hazards.push("active fire");
        recommendedResources.push("FIRE_TRUCK");
    }
    if (/collapse|cracked wall|debris|rubble/i.test(text)) {
        hazards.push("structural instability");
        recommendedResources.push("HEAVY_RESCUE_TEAM");
    }
    if (/elderly|senior|baby|infant|pregnant|child/i.test(text)) {
        urgencySignals.push("vulnerable population involved");
    }
    if (/blocked road|no access|impassable/i.test(text)) {
        hazards.push("blocked access route");
    }

    // Default resource if none
    if (recommendedResources.length === 0) {
        recommendedResources.push("FIRST_RESPONSE_TEAM");
    }

    // Determine priority
    let priorityRecommendation = PriorityTier.P3;
    if (urgencySignals.some(s => /trapped|medical casualties/i.test(s)) || injuredPeople > 0 || peopleAtRisk >= 3) {
        priorityRecommendation = PriorityTier.P1;
    } else if (hazards.length > 0 || peopleAtRisk > 0) {
        priorityRecommendation = PriorityTier.P2;
    }

    const explanation = [
        `Heuristic classification based on keyword signals in report description.`,
        ...(urgencySignals.map(s => `Detected signal: ${s}`)),
        ...(hazards.map(h => `Identified hazard: ${h}`))
    ];

    return validateAiAnalysis({
        category,
        priorityRecommendation,
        confidence: 0.72,
        peopleAtRisk,
        injuredPeople,
        urgencySignals,
        hazards,
        recommendedResources,
        summary: description ? `Emergency report: ${description.slice(0, 150)}` : "Report intake awaiting field inspection.",
        explanation,
        requiresHumanVerification: true,
        modelInfo: "deterministic-heuristic-fallback"
    });
}
