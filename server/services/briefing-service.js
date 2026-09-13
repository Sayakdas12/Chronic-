// ============================================================
// CHRONICAI RESPONSE NETWORK — AI DISTRICT SITREP BRIEFING
// Automated executive situation reports from live incident telemetry
// ============================================================

import { GoogleGenAI } from "@google/genai";
import { readAllIncidents } from "./incident-service.js";
import { readAllMissions, readAllResources } from "./mission-service.js";
import { readAllRoadClosures } from "./sync-service.js";

export async function generateDistrictBriefing({ district = "Ward 7", modelOverride = null } = {}) {
    const incidents = await readAllIncidents();
    const missions = await readAllMissions();
    const resources = await readAllResources();
    const roadClosures = await readAllRoadClosures();
    const uniqueRoadClosures = [...new Map(roadClosures.map((closure) => {
        const key = `${String(closure.roadName || "").trim().toLowerCase()}|${String(closure.reason || "").trim().toLowerCase()}`;
        return [key, closure];
    })).values()];

    // Compute live metrics
    const p1Count = incidents.filter(i => i.priority === "P1" && i.status !== "RESOLVED").length;
    const p2Count = incidents.filter(i => i.priority === "P2" && i.status !== "RESOLVED").length;
    const p3Count = incidents.filter(i => (i.priority === "P3" || i.priority === "P4") && i.status !== "RESOLVED").length;
    const resolvedCount = incidents.filter(i => i.status === "RESOLVED").length;
    const unverifiedCount = incidents.filter(i => i.status === "NEEDS_VERIFICATION").length;

    let totalVictimsAtRisk = 0;
    let totalInjured = 0;
    let totalRescued = 0;

    for (const inc of incidents) {
        if (inc.status !== "RESOLVED") {
            totalVictimsAtRisk += Number(inc.aiAnalysis?.peopleAtRisk || 0);
            totalInjured += Number(inc.aiAnalysis?.injuredPeople || 0);
        }
        totalRescued += Number(inc.rescuedPeople || 0);
    }

    const availableAmbulances = resources.filter(r => r.type === "AMBULANCE" && r.status === "AVAILABLE").length;
    const dispatchedAmbulances = resources.filter(r => r.type === "AMBULANCE" && r.status === "DISPATCHED").length;
    const availableRescueTeams = resources.filter(r => r.type === "RESCUE_TEAM" && r.status === "AVAILABLE").length;
    const activeMissions = missions.filter(m => m.status !== "COMPLETED" && m.status !== "CANCELLED").length;

    const criticalLocations = incidents
        .filter(i => (i.priority === "P1" || i.priority === "P2") && i.status !== "RESOLVED")
        .map(i => `${i.title} (${i.location?.text || "Sector"}: ${i.priority})`);

    const blockedRoutes = uniqueRoadClosures.map(rc => `${rc.roadName}: ${String(rc.reason || "Reported obstruction").replace(/[.;\s]+$/, "")}`);

    // Try Gemini AI synthesis
    const apiKey = process.env.GEMINI_API_KEY;
    const isTestRun = process.env.NODE_ENV === "test" || process.argv.some(a => a.includes("test"));
    if (apiKey && !isTestRun) {
        try {
            const ai = new GoogleGenAI({ apiKey });
            const model = modelOverride || process.env.GEMINI_MODEL || "gemini-3.5-flash";

            const prompt = `You are the AI Command Advisor for the ChronicAI Emergency Operations Center.
Synthesize an authoritative, actionable 3-paragraph Situation Report (SitRep) for the Incident Commander based on this real-time district telemetry:

District: ${district}
Active P1 Emergencies: ${p1Count}
Active P2 Emergencies: ${p2Count}
Active P3 Civic Cases: ${p3Count}
Unverified Incoming Incidents: ${unverifiedCount}
Casualties At Immediate Risk: ${totalVictimsAtRisk}
Casualties Injured: ${totalInjured}
Casualties Successfully Rescued: ${totalRescued}
Available Fleet: ${availableAmbulances} Ambulances available (${dispatchedAmbulances} deployed), ${availableRescueTeams} Rescue Teams available.
Active Field Missions: ${activeMissions}
Critical Hazard Locations: ${criticalLocations.join("; ") || "None"}
Road Blockages: ${blockedRoutes.join("; ") || "None"}

Format output as concise JSON:
{
  "headline": "Short military/command style headline",
  "threatLevel": "CRITICAL | HIGH | ELEVATED | MONITOR",
  "situationSummary": "Executive summary paragraph",
  "tacticalDirectives": ["Top 3-4 numbered immediate command directives"],
  "routeAdvisory": "Summary of transit route hazards",
  "casualtySitRep": "Casualty and evacuation overview"
}`;

            const response = await Promise.race([
                ai.models.generateContent({
                    model,
                    contents: prompt,
                    config: { responseMimeType: "application/json" }
                }),
                new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 10000))
            ]);

            const parsed = JSON.parse(response.text.trim());
            return {
                success: true,
                generatedBy: "gemini-flash",
                district,
                timestamp: Date.now(),
                metrics: {
                    p1Count,
                    p2Count,
                    p3Count,
                    resolvedCount,
                    unverifiedCount,
                    totalVictimsAtRisk,
                    totalInjured,
                    totalRescued,
                    availableAmbulances,
                    dispatchedAmbulances,
                    activeMissions,
                    blockedRoadsCount: uniqueRoadClosures.length
                },
                briefing: parsed
            };
        } catch (error) {
            console.warn("Gemini SitRep generation deferred to deterministic heuristic:", error.message);
        }
    }

    // Deterministic Heuristic SitRep Generation (High-reliability fallback)
    const threatLevel = p1Count > 0 ? "CRITICAL" : p2Count > 0 ? "HIGH" : "ELEVATED";
    const headline = p1Count > 0
        ? `FLASH FLOOD SURGE IN ${district.toUpperCase()} — ${p1Count} ACTIVE P1 LIFE-THREAT EMERGENCIES`
        : `TACTICAL SITREP — ${district.toUpperCase()} DISASTER RESPONSE GRID ACTIVE`;

    const situationSummary = `Severe flash flooding is impacting ${district}. The command center is actively managing ${p1Count} P1 critical life-threat emergencies and ${p2Count} P2 secondary structural/infrastructure hazards. Total identified population at immediate risk is ${totalVictimsAtRisk} citizens with ${totalInjured} casualties requiring medical transport. ${totalRescued} citizens have been successfully evacuated to designated relief shelters.`;

    const tacticalDirectives = [
        p1Count > 0
            ? `Dispatch remaining available water rescue units and ambulances to prioritized P1 flood zones (${criticalLocations.slice(0, 2).join("; ")}).`
            : `Maintain active patrol and verify ${unverifiedCount} incoming citizen reports in queue.`,
        blockedRoutes.length > 0
            ? `Reroute emergency convoys away from confirmed obstructions: ${uniqueRoadClosures.map(rc => rc.roadName).slice(0, 2).join(", ")}.`
            : `Keep primary evacuation arteries monitored for waterlogging.`,
        `Pre-position medical supplies and clean drinking water at designated Ward 7 evacuation shelters.`,
        `Direct field responders to utilize offline queueing in flood dead-zones to ensure casualty updates are preserved.`
    ];

    const routeAdvisory = blockedRoutes.length > 0
        ? `${blockedRoutes.length} primary transit arteries blocked by floodwaters: ${blockedRoutes.slice(0, 6).join("; ")}${blockedRoutes.length > 6 ? "; and additional reported obstructions" : ""}.`
        : `All primary access routes currently passable. Monitor low-lying underpasses.`;

    const casualtySitRep = `${totalVictimsAtRisk} citizens currently in flood-impacted structures; ${totalInjured} casualties under triage; ${totalRescued} successfully rescued and evacuated.`;

    return {
        success: true,
        generatedBy: "deterministic-command-heuristics",
        district,
        timestamp: Date.now(),
        metrics: {
            p1Count,
            p2Count,
            p3Count,
            resolvedCount,
            unverifiedCount,
            totalVictimsAtRisk,
            totalInjured,
            totalRescued,
            availableAmbulances,
            dispatchedAmbulances,
            activeMissions,
            blockedRoadsCount: uniqueRoadClosures.length
        },
        briefing: {
            headline,
            threatLevel,
            situationSummary,
            tacticalDirectives,
            routeAdvisory,
            casualtySitRep
        }
    };
}
