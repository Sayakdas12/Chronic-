// ============================================================
// CHRONICAI RESPONSE NETWORK — DUPLICATE DETECTION ENGINE
// 3-Stage spatial, temporal, and semantic candidate matching
// ============================================================

import { IncidentStatus } from "../domain/incident.js";

// Haversine formula in meters
export function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
    if (!Number.isFinite(lat1) || !Number.isFinite(lon1) || !Number.isFinite(lat2) || !Number.isFinite(lon2)) {
        return null;
    }
    const R = 6371000; // Earth radius in meters
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
}

// Tokenize and clean text
function tokenize(text) {
    const stopwords = new Set([
        "the", "a", "an", "and", "or", "but", "is", "are", "was", "were",
        "in", "on", "at", "to", "for", "with", "by", "about", "of", "near"
    ]);
    return String(text || "")
        .toLowerCase()
        .replace(/[^\w\s]/g, " ")
        .split(/\s+/)
        .filter(t => t.length > 2 && !stopwords.has(t));
}

// Jaccard similarity
export function computeJaccardSimilarity(textA, textB) {
    const setA = new Set(tokenize(textA));
    const setB = new Set(tokenize(textB));
    if (setA.size === 0 || setB.size === 0) return 0;

    let intersection = 0;
    for (const token of setA) {
        if (setB.has(token)) intersection += 1;
    }
    const union = new Set([...setA, ...setB]).size;
    return union === 0 ? 0 : intersection / union;
}

export function evaluateDuplicatePair(source, target) {
    if (source.incidentId === target.incidentId) return null;
    if (target.status === IncidentStatus.REJECTED || target.status === IncidentStatus.DUPLICATE) return null;

    const reasons = [];
    let similarityScore = 0;

    // 1. Spatial Match
    const lat1 = source.location?.latitude;
    const lon1 = source.location?.longitude;
    const lat2 = target.location?.latitude;
    const lon2 = target.location?.longitude;
    const distanceMeters = calculateDistanceMeters(lat1, lon1, lat2, lon2);

    let spatialScore = 0;
    if (distanceMeters !== null) {
        if (distanceMeters <= 100) {
            spatialScore = 40;
            reasons.push(`Immediate proximity: ${distanceMeters}m`);
        } else if (distanceMeters <= 300) {
            spatialScore = 35;
            reasons.push(`Within 300m range (${distanceMeters}m)`);
        } else if (distanceMeters <= 1000) {
            spatialScore = 20;
            reasons.push(`Same neighborhood area (${distanceMeters}m)`);
        } else {
            spatialScore = 0;
        }
    } else {
        // Fallback string location match
        const locSim = computeJaccardSimilarity(source.location?.text, target.location?.text);
        if (locSim > 0.4) {
            spatialScore = Math.round(locSim * 30);
            reasons.push(`Location address similarity (${Math.round(locSim * 100)}%)`);
        }
    }

    // 2. Temporal Match
    const t1 = source.createdAt || Date.now();
    const t2 = target.createdAt || Date.now();
    const diffMinutes = Math.abs(t1 - t2) / (60 * 1000);

    let temporalScore = 0;
    if (diffMinutes <= 15) {
        temporalScore = 25;
        reasons.push(`Reported within 15 min (${Math.round(diffMinutes)}m diff)`);
    } else if (diffMinutes <= 30) {
        temporalScore = 20;
        reasons.push(`Reported within 30 min (${Math.round(diffMinutes)}m diff)`);
    } else if (diffMinutes <= 120) {
        temporalScore = 10;
        reasons.push(`Reported within 2 hours (${Math.round(diffMinutes)}m diff)`);
    } else {
        temporalScore = 0;
    }

    // 3. Category & Text Semantic Match
    let categoryScore = 0;
    const cat1 = String(source.category || "").toLowerCase();
    const cat2 = String(target.category || "").toLowerCase();
    if (cat1 && cat2 && (cat1 === cat2 || cat1.includes(cat2) || cat2.includes(cat1))) {
        categoryScore = 20;
        reasons.push(`Matching category: ${source.category}`);
    }

    const text1 = `${source.title} ${source.description}`;
    const text2 = `${target.title} ${target.description}`;
    const textSim = computeJaccardSimilarity(text1, text2);
    let textScore = Math.round(textSim * 25);
    if (textSim > 0.25) {
        reasons.push(`Description similarity (${Math.round(textSim * 100)}%)`);
    }

    similarityScore = Math.min(100, spatialScore + temporalScore + categoryScore + textScore);

    // Shared keyword signals
    const signals1 = new Set(tokenize(text1));
    const signals2 = new Set(tokenize(text2));
    const sharedSignals = [...signals1].filter(t => signals2.has(t) && t.length >= 4);

    return {
        targetIncidentId: target.incidentId,
        targetPublicId: target.publicId,
        targetTitle: target.title,
        targetStatus: target.status,
        targetPriority: target.priority,
        targetLocation: target.location,
        similarityScore,
        isLikelyDuplicate: similarityScore >= 60,
        distanceMeters,
        diffMinutes: Math.round(diffMinutes),
        sharedSignals: sharedSignals.slice(0, 5),
        reasons
    };
}

export function findDuplicateCandidates(sourceIncident, allIncidents, threshold = 40) {
    if (!sourceIncident || !Array.isArray(allIncidents)) return [];

    const candidates = [];
    for (const incident of allIncidents) {
        const evaluation = evaluateDuplicatePair(sourceIncident, incident);
        if (evaluation && evaluation.similarityScore >= threshold) {
            candidates.push(evaluation);
        }
    }

    candidates.sort((a, b) => b.similarityScore - a.similarityScore);
    return candidates;
}
