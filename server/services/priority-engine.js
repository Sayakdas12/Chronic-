// ============================================================
// CHRONICAI RESPONSE NETWORK — DETERMINISTIC PRIORITY ENGINE
// Explainable hybrid priority scoring with life-threat & vulnerability factors
// ============================================================

import { PriorityTier } from "../domain/incident.js";

const SEVERITY_POINTS = {
    CRITICAL: 40,
    P1: 40,
    SEVERE: 35,
    HIGH: 25,
    P2: 25,
    MEDIUM: 15,
    P3: 15,
    LOW: 5,
    P4: 5
};

export const RESPONSE_TARGETS = {
    [PriorityTier.P1]: {
        label: "Immediate Emergency",
        acknowledgeMinutes: 1,
        assignMinutes: 2,
        dispatchMinutes: 5,
        targetResolutionHours: 4
    },
    [PriorityTier.P2]: {
        label: "Urgent Response",
        acknowledgeMinutes: 5,
        assignMinutes: 10,
        dispatchMinutes: 30,
        targetResolutionHours: 12
    },
    [PriorityTier.P3]: {
        label: "Standard Civic",
        acknowledgeMinutes: 120, // 2 hours
        assignMinutes: 240,     // 4 hours
        dispatchMinutes: 480,
        targetResolutionHours: 48
    },
    [PriorityTier.P4]: {
        label: "Routine",
        acknowledgeMinutes: 360, // 6 hours
        assignMinutes: 720,
        dispatchMinutes: 1440,
        targetResolutionHours: 96
    }
};

export function calculatePriorityScore({
    aiAnalysis = null,
    peopleAtRisk = 0,
    injuredPeople = 0,
    missingPeople = 0,
    severity = "MEDIUM",
    signals = [],
    location = {},
    sourceReportCount = 1,
    createdAt = Date.now(),
    officerOverride = null
}) {
    const reasons = [];

    // 1. Base people numbers
    const riskCount = Math.max(0, parseInt(peopleAtRisk || aiAnalysis?.peopleAtRisk || 0, 10));
    const injuredCount = Math.max(0, parseInt(injuredPeople || aiAnalysis?.injuredPeople || 0, 10));
    const missingCount = Math.max(0, parseInt(missingPeople || 0, 10));

    let peopleScore = (riskCount * 5) + (injuredCount * 10) + (missingCount * 15);
    if (riskCount > 0) reasons.push(`${riskCount} people at risk (+${riskCount * 5} pts)`);
    if (injuredCount > 0) reasons.push(`${injuredCount} injured casualties (+${injuredCount * 10} pts)`);
    if (missingCount > 0) reasons.push(`${missingCount} missing persons (+${missingCount * 15} pts)`);

    // 2. Base hazard severity
    const sevKey = String(severity || aiAnalysis?.priorityRecommendation || "MEDIUM").toUpperCase();
    const hazardSeverityPoints = SEVERITY_POINTS[sevKey] || SEVERITY_POINTS.MEDIUM;
    reasons.push(`Base hazard severity ${sevKey} (+${hazardSeverityPoints} pts)`);

    // 3. Life threat modifiers
    let lifeThreatPoints = 0;
    const combinedSignals = [
        ...signals,
        ...(aiAnalysis?.urgencySignals || []),
        ...(aiAnalysis?.hazards || [])
    ].map(s => String(s).toLowerCase());

    const hasSignal = (pattern) => combinedSignals.some(s => pattern.test(s));

    if (hasSignal(/trapped|stranded|cannot escape/)) {
        lifeThreatPoints += 25;
        reasons.push("Trapped victims detected (+25 pts)");
    }
    if (hasSignal(/fire|explosion|flames/)) {
        lifeThreatPoints += 25;
        reasons.push("Active fire or explosion risk (+25 pts)");
    }
    if (hasSignal(/building collapse|structural collapse|collapse|rubble|cracked wall|cracked pillar/) && !hasSignal(/asphalt|pavement|pothole/)) {
        lifeThreatPoints += 25;
        reasons.push("Structural building collapse (+25 pts)");
    }
    if (hasSignal(/water rising|flash flood|surging/)) {
        lifeThreatPoints += 20;
        reasons.push("Rapidly rising flood waters (+20 pts)");
    }
    if (hasSignal(/power line|electrical shock|live wire/)) {
        lifeThreatPoints += 15;
        reasons.push("Live high-voltage hazard (+15 pts)");
    }

    // 4. Vulnerability modifiers
    let vulnerabilityPoints = 0;
    const locText = String(location.text || "").toLowerCase();

    if (/hospital|clinic|nursing|health center/i.test(locText) || hasSignal(/hospital/)) {
        vulnerabilityPoints += 20;
        reasons.push("Critical healthcare infrastructure in vicinity (+20 pts)");
    } else if (/school|college|university|kindergarten/i.test(locText) || hasSignal(/school/)) {
        vulnerabilityPoints += 20;
        reasons.push("Educational institution / children involved (+20 pts)");
    }

    if (hasSignal(/elderly|disabled|infant|baby|children/)) {
        vulnerabilityPoints += 15;
        reasons.push("Vulnerable demographics (elderly/children) present (+15 pts)");
    }

    // Multi-report corroboration
    if (sourceReportCount > 1) {
        const bonus = Math.min(20, sourceReportCount * 5);
        vulnerabilityPoints += bonus;
        reasons.push(`${sourceReportCount} independent reports corroborate incident (+${bonus} pts)`);
    }

    // 5. Time decay urgency (unaddressed elapsed time)
    let timeDecayPoints = 0;
    const elapsedMinutes = Math.max(0, (Date.now() - createdAt) / (60 * 1000));
    if (elapsedMinutes > 30) {
        timeDecayPoints = Math.min(15, Math.floor(elapsedMinutes / 30) * 3);
        if (timeDecayPoints > 0) {
            reasons.push(`Elapsed response latency: ${Math.round(elapsedMinutes)} min (+${timeDecayPoints} pts)`);
        }
    }

    // Total computation
    let computedScore = Math.min(100, Math.max(0,
        peopleScore + hazardSeverityPoints + lifeThreatPoints + vulnerabilityPoints + timeDecayPoints
    ));

    // Determine tier
    let tier = PriorityTier.P4;
    if (computedScore >= 81) tier = PriorityTier.P1;
    else if (computedScore >= 51) tier = PriorityTier.P2;
    else if (computedScore >= 26) tier = PriorityTier.P3;
    else tier = PriorityTier.P4;

    // Officer override handling
    let isOverridden = false;
    let overrideReason = null;
    let originalTier = tier;

    if (officerOverride && officerOverride.tier && PriorityTier[officerOverride.tier]) {
        if (!officerOverride.reason || String(officerOverride.reason).trim().length < 5) {
            throw new Error("Officer priority override requires an overrideReason of at least 5 characters.");
        }
        tier = officerOverride.tier;
        isOverridden = true;
        overrideReason = String(officerOverride.reason).trim();
        reasons.unshift(`OFFICER MANUAL OVERRIDE to ${tier}: ${overrideReason}`);
    }

    return {
        totalScore: computedScore,
        tier,
        originalTier: isOverridden ? originalTier : tier,
        isOverridden,
        overrideReason,
        targets: RESPONSE_TARGETS[tier],
        breakdown: {
            peopleScore,
            hazardSeverityPoints,
            lifeThreatPoints,
            vulnerabilityPoints,
            timeDecayPoints,
            reasons
        },
        calculatedAt: Date.now()
    };
}
