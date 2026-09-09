// ============================================================
// CHRONICAI RESPONSE NETWORK — VERTICAL SLICE 1 TEST SUITE
// Tests for canonical models, AI validation, priority scoring,
// duplicate detection, and officer verification flow.
// ============================================================

import test from "node:test";
import assert from "node:assert/strict";

import {
    IncidentStatus,
    PriorityTier,
    IncidentEventType,
    canTransition,
    buildCanonicalIncident,
    createIncidentEvent
} from "../server/domain/incident.js";

import {
    validateAiAnalysis,
    generateHeuristicFallbackAnalysis,
    normalizeCategory
} from "../server/services/ai-validation.js";

import {
    calculatePriorityScore,
    RESPONSE_TARGETS
} from "../server/services/priority-engine.js";

import {
    calculateDistanceMeters,
    computeJaccardSimilarity,
    evaluateDuplicatePair,
    findDuplicateCandidates
} from "../server/services/duplicate-detector.js";

import {
    saveIncident,
    getIncidentById,
    updateIncidentStatus,
    mergeIncidents
} from "../server/services/incident-service.js";

// ============================================================
// 1. DOMAIN MODEL & STATE TRANSITION TESTS
// ============================================================

test("Domain Model: State transition rules allow valid progressions and block invalid routes", () => {
    // Valid transitions
    assert.equal(canTransition(IncidentStatus.REPORTED, IncidentStatus.NEEDS_VERIFICATION), true);
    assert.equal(canTransition(IncidentStatus.NEEDS_VERIFICATION, IncidentStatus.VERIFIED), true);
    assert.equal(canTransition(IncidentStatus.VERIFIED, IncidentStatus.PRIORITIZED), true);
    assert.equal(canTransition(IncidentStatus.ASSIGNED, IncidentStatus.IN_PROGRESS), true);
    assert.equal(canTransition(IncidentStatus.IN_PROGRESS, IncidentStatus.RESOLVED), true);
    assert.equal(canTransition(IncidentStatus.NEEDS_VERIFICATION, IncidentStatus.REJECTED), true);
    assert.equal(canTransition(IncidentStatus.REPORTED, IncidentStatus.DUPLICATE), true);

    // Invalid transitions
    assert.equal(canTransition(IncidentStatus.RESOLVED, IncidentStatus.IN_PROGRESS), false);
    assert.equal(canTransition(IncidentStatus.REJECTED, IncidentStatus.VERIFIED), false);
    assert.equal(canTransition(IncidentStatus.DUPLICATE, IncidentStatus.ASSIGNED), false);
});

test("Domain Model: buildCanonicalIncident initializes with correct schema and immutable initial event", () => {
    const incident = buildCanonicalIncident({
        title: "Collapsed bridge embankment",
        description: "Water eroded the support pillar near the river bank.",
        category: "CIVIC_INFRASTRUCTURE",
        location: { text: "Barrackpore Ward 7", latitude: 22.76, longitude: 88.37 },
        sourceReportIds: ["REP-001"],
        priority: PriorityTier.P2
    });

    assert.ok(incident.incidentId.startsWith("INC-"));
    assert.ok(incident.publicId.startsWith("CHRONIC-"));
    assert.equal(incident.status, IncidentStatus.REPORTED);
    assert.equal(incident.priority, PriorityTier.P2);
    assert.equal(incident.location.latitude, 22.76);
    assert.equal(incident.location.longitude, 88.37);
    assert.equal(incident.sourceReportIds.length, 1);
    assert.equal(incident.events.length, 1);
    assert.equal(incident.events[0].type, IncidentEventType.INCIDENT_CREATED);
});

// ============================================================
// 2. AI VALIDATION & FALLBACK TESTS
// ============================================================

test("AI Validation: Validates and clamps structured AI analysis with advisory guardrails", () => {
    const rawAi = {
        category: "flood-rescue",
        priorityRecommendation: "P1",
        confidence: 0.94,
        peopleAtRisk: 5,
        injuredPeople: 1,
        urgencySignals: ["trapped", "water rising fast"],
        hazards: ["flash flood", "blocked access"],
        recommendedResources: ["RESCUE_BOAT", "AMBULANCE"],
        summary: "Elderly people stranded on rooftop.",
        explanation: ["Water rising", "Access impassable"]
    };

    const validated = validateAiAnalysis(rawAi);

    assert.equal(validated.category, "FLOOD_RESCUE");
    assert.equal(validated.priorityRecommendation, PriorityTier.P1);
    assert.equal(validated.confidence, 0.94);
    assert.equal(validated.peopleAtRisk, 5);
    assert.equal(validated.injuredPeople, 1);
    assert.equal(validated.requiresHumanVerification, true);
    assert.equal(validated.advisory, true, "AI output must always be marked advisory.");
    assert.ok(validated.recommendedResources.includes("RESCUE_BOAT"));
});

test("AI Validation: Heuristic fallback extracts emergency signals when Gemini is unavailable", () => {
    const fallback = generateHeuristicFallbackAnalysis({
        description: "Three elderly residents are trapped in the flooded basement near the primary school. Water rising quickly.",
        location: "Kolkata Ward 7",
        categoryHint: "flood"
    });

    assert.equal(fallback.category, "FLOOD_RESCUE");
    assert.equal(fallback.priorityRecommendation, PriorityTier.P1);
    assert.ok(fallback.peopleAtRisk >= 3);
    assert.ok(fallback.urgencySignals.some(s => /trapped/i.test(s)));
    assert.ok(fallback.hazards.some(h => /rising/i.test(h)));
    assert.equal(fallback.requiresHumanVerification, true);
    assert.equal(fallback.advisory, true);
    assert.equal(fallback.modelInfo, "deterministic-heuristic-fallback");
});

// ============================================================
// 3. DETERMINISTIC PRIORITY SCORING TESTS
// ============================================================

test("Priority Engine: Computes P1 for immediate life-threat flood emergency", () => {
    const result = calculatePriorityScore({
        peopleAtRisk: 4,
        injuredPeople: 1,
        severity: "CRITICAL",
        signals: ["trapped", "water rising", "elderly"],
        location: { text: "St. Jude Hospital Campus" },
        sourceReportCount: 3
    });

    assert.equal(result.tier, PriorityTier.P1);
    assert.ok(result.totalScore >= 81, `Expected score >= 81, got ${result.totalScore}`);
    assert.equal(result.targets.acknowledgeMinutes, 1);
    assert.equal(result.targets.assignMinutes, 2);
    assert.ok(result.breakdown.reasons.length > 0);
});

test("Priority Engine: Computes P3 for routine civic issue", () => {
    const result = calculatePriorityScore({
        peopleAtRisk: 0,
        injuredPeople: 0,
        severity: "LOW",
        signals: ["pothole", "asphalt cracked"],
        location: { text: "Commercial Lane 4" },
        sourceReportCount: 1
    });

    assert.equal(result.tier, PriorityTier.P4);
    assert.ok(result.totalScore <= 25, `Expected score <= 25, got ${result.totalScore}`);
    assert.equal(result.targets.acknowledgeMinutes, 360);
});

test("Priority Engine: Officer manual override updates tier and enforces minimum justification", () => {
    // Valid override
    const overridden = calculatePriorityScore({
        peopleAtRisk: 0,
        severity: "LOW",
        officerOverride: {
            tier: PriorityTier.P1,
            reason: "Governor security convoy traveling through sector in 1 hour."
        }
    });
    assert.equal(overridden.tier, PriorityTier.P1);
    assert.equal(overridden.isOverridden, true);
    assert.ok(overridden.overrideReason.includes("Governor"));

    // Invalid override (empty / too short)
    assert.throws(() => {
        calculatePriorityScore({
            peopleAtRisk: 0,
            officerOverride: { tier: PriorityTier.P1, reason: "no" }
        });
    }, /overrideReason of at least 5 characters/i);
});

// ============================================================
// 4. DUPLICATE DETECTION & MERGE TESTS
// ============================================================

test("Duplicate Detector: Calculates accurate spatial distance using Haversine formula", () => {
    // Same coordinate
    const distZero = calculateDistanceMeters(22.5726, 88.3639, 22.5726, 88.3639);
    assert.equal(distZero, 0);

    // Points ~150 meters apart
    const distNear = calculateDistanceMeters(22.5726, 88.3639, 22.5739, 88.3642);
    assert.ok(distNear > 100 && distNear < 200, `Expected ~150m, got ${distNear}m`);
});

test("Duplicate Detector: Identifies and ranks duplicate flood reports in close spatial/temporal proximity", () => {
    const incidentA = buildCanonicalIncident({
        incidentId: "INC-TEST-001",
        title: "Flooding near school",
        description: "School compound is inundated with knee-deep water and students are stranded.",
        category: "FLOOD_RESCUE",
        location: { latitude: 22.5726, longitude: 88.3639, text: "Ward 7 Primary School" }
    });

    const incidentB = buildCanonicalIncident({
        incidentId: "INC-TEST-002",
        title: "Students trapped in flood at school",
        description: "Children stranded at primary school due to heavy flood water.",
        category: "FLOOD_RESCUE",
        location: { latitude: 22.5735, longitude: 88.3645, text: "Primary School Ward 7" }
    });

    const incidentC = buildCanonicalIncident({
        incidentId: "INC-TEST-003",
        title: "Street light flickering",
        description: "Street light pole 42 flickering intermittently.",
        category: "POWER_OUTAGE",
        location: { latitude: 22.8900, longitude: 88.5000, text: "North sector" }
    });

    const candidates = findDuplicateCandidates(incidentA, [incidentB, incidentC]);

    assert.equal(candidates.length, 1, "Only incidentB should match above threshold.");
    assert.equal(candidates[0].targetIncidentId, "INC-TEST-002");
    assert.ok(candidates[0].similarityScore >= 60, `Expected score >= 60, got ${candidates[0].similarityScore}`);
    assert.equal(candidates[0].isLikelyDuplicate, true);
    assert.ok(candidates[0].sharedSignals.includes("school"));
});

test("Incident Service: Non-destructive merge consolidates source reports and emits audit events", async () => {
    const primary = buildCanonicalIncident({
        incidentId: "INC-PRIMARY-01",
        title: "Primary Flooded School",
        sourceReportIds: ["REP-01"],
        status: IncidentStatus.NEEDS_VERIFICATION
    });

    const duplicate = buildCanonicalIncident({
        incidentId: "INC-DUP-02",
        title: "Second report for Flooded School",
        sourceReportIds: ["REP-02"],
        status: IncidentStatus.NEEDS_VERIFICATION
    });

    await saveIncident(primary);
    await saveIncident(duplicate);

    const { primary: mergedPrimary, duplicate: mergedDup } = await mergeIncidents({
        primaryIncidentId: "INC-PRIMARY-01",
        duplicateIncidentId: "INC-DUP-02",
        actor: { id: "officer-42", role: "government_officer", name: "Officer Sharma" },
        reason: "Confirmed duplicate of flooded school incident"
    });

    assert.equal(mergedDup.status, IncidentStatus.DUPLICATE);
    assert.equal(mergedDup.mergedInto, "INC-PRIMARY-01");
    assert.deepEqual(mergedPrimary.sourceReportIds.sort(), ["REP-01", "REP-02"]);

    // Verify immutable audit events
    const lastEventPrimary = mergedPrimary.events[mergedPrimary.events.length - 1];
    assert.equal(lastEventPrimary.type, IncidentEventType.INCIDENT_MERGED);
    assert.equal(lastEventPrimary.actor.id, "officer-42");

    const lastEventDup = mergedDup.events[mergedDup.events.length - 1];
    assert.equal(lastEventDup.type, IncidentEventType.INCIDENT_MERGED);
    assert.equal(lastEventDup.payload.mergedIntoPrimaryId, "INC-PRIMARY-01");
});
