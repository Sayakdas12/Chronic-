// ============================================================
// CHRONICAI RESPONSE NETWORK — WARD 7 FLASH FLOOD SCENARIO
// Realistic hackathon demo dataset: 20 reports, 6 canonical incidents,
// 4 ambulances, 3 rescue teams, 3 shelters, 2 blocked roads, 2 hospitals.
// ============================================================

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import {
    IncidentStatus,
    PriorityTier,
    buildCanonicalIncident
} from "../domain/incident.js";

import {
    ResourceType,
    ResourceStatus,
    MissionStatus,
    buildResource,
    buildMission
} from "../domain/operations.js";

import {
    saveIncident,
    readAllIncidents
} from "../services/incident-service.js";

import {
    saveResource,
    saveMission,
    readAllResources,
    readAllMissions
} from "../services/mission-service.js";

import {
    saveRoadClosure
} from "../services/sync-service.js";

import { calculatePriorityScore } from "../services/priority-engine.js";
import { validateAiAnalysis } from "../services/ai-validation.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "..", "..", "data");
const REPORTS_FILE = path.join(DATA_DIR, "reports.json");

export async function seedWard7Scenario() {
    console.log("Seeding Ward 7 Flash Flood Disaster Scenario...");

    // ========================================================
    // 1. 20 CITIZEN & SENSOR REPORTS
    // ========================================================
    const reports = [
        // Flooded School Cluster (Candidates for Duplicate Merge)
        {
            reportId: "REP-W7-01",
            category: "FLOOD_RESCUE",
            description: "Four elderly people trapped on the ground floor of Ward 7 Primary School. Water level rising fast.",
            location: "Ward 7 Primary School, School Road",
            latitude: 22.5726,
            longitude: 88.3639,
            priority: "Critical",
            status: "Submitted",
            reporter: { name: "Ananya Roy", phone: "+91 98301 23456" },
            createdAt: Date.now() - 25 * 60 * 1000
        },
        {
            reportId: "REP-W7-02",
            category: "FLOOD_RESCUE",
            description: "Water has entered primary school compound. Old people cannot walk out through current.",
            location: "Primary School Ward 7",
            latitude: 22.5732,
            longitude: 88.3645,
            priority: "High",
            status: "Submitted",
            reporter: { name: "Subhasish Das", phone: "+91 98302 34567" },
            createdAt: Date.now() - 20 * 60 * 1000
        },
        {
            reportId: "REP-W7-03",
            category: "FLOOD_RESCUE",
            description: "School building flooded near ground floor gate. Seniors trapped inside.",
            location: "School Road, Ward 7",
            latitude: 22.5728,
            longitude: 88.3637,
            priority: "Critical",
            status: "Submitted",
            reporter: { name: "Pooja Banerjee", phone: "+91 98303 45678" },
            createdAt: Date.now() - 15 * 60 * 1000
        },

        // Submerged Care Home (P1)
        {
            reportId: "REP-W7-04",
            category: "FLOOD_RESCUE",
            description: "Elder Care Haven nursing facility submerged in 4 feet water. 12 bedridden patients need urgent rescue.",
            location: "Elder Care Haven, Health Post Lane",
            latitude: 22.5695,
            longitude: 88.3615,
            priority: "Critical",
            status: "Submitted",
            reporter: { name: "Dr. K. Sengupta", phone: "+91 98304 56789" },
            createdAt: Date.now() - 40 * 60 * 1000
        },
        {
            reportId: "REP-W7-05",
            category: "FLOOD_RESCUE",
            description: "Elderly patients trapped in nursing home on Health Post Lane as water surges.",
            location: "Health Post Lane Care Center",
            latitude: 22.5698,
            longitude: 88.3620,
            priority: "Critical",
            status: "Submitted",
            reporter: { name: "Nurse Meena", phone: "+91 98305 67890" },
            createdAt: Date.now() - 35 * 60 * 1000
        },

        // Collapsed River Embankment (P2)
        {
            reportId: "REP-W7-06",
            category: "BUILDING_COLLAPSE",
            description: "Embankment retaining wall collapsed near River Road bridge. Road cracking open.",
            location: "River Road Embankment Km 3",
            latitude: 22.5780,
            longitude: 88.3580,
            priority: "High",
            status: "Submitted",
            reporter: { name: "Rajesh Paul", phone: "+91 98306 78901" },
            createdAt: Date.now() - 50 * 60 * 1000
        },
        {
            reportId: "REP-W7-07",
            category: "BUILDING_COLLAPSE",
            description: "River retaining wall broke under flood pressure. Debris sliding toward residences.",
            location: "River Road Km 3.2",
            latitude: 22.5785,
            longitude: 88.3585,
            priority: "High",
            status: "Submitted",
            reporter: { name: "Amitabha Roy", phone: "+91 98307 89012" },
            createdAt: Date.now() - 45 * 60 * 1000
        },

        // Power Substation Ingress (P2)
        {
            reportId: "REP-W7-08",
            category: "POWER_OUTAGE",
            description: "Floodwaters reaching high-voltage transformers at Ward 7 Electrical Substation. Risk of massive short circuit.",
            location: "CESC Power Substation, Sector 2",
            latitude: 22.5820,
            longitude: 88.3710,
            priority: "High",
            status: "Submitted",
            reporter: { name: "Engineer D. Mukherjee", phone: "+91 98308 90123" },
            createdAt: Date.now() - 30 * 60 * 1000
        },
        {
            reportId: "REP-W7-09",
            category: "POWER_OUTAGE",
            description: "Transformer yard flooded with water. Sparks visible from transformer B.",
            location: "Sector 2 Substation",
            latitude: 22.5824,
            longitude: 88.3715,
            priority: "High",
            status: "Submitted",
            reporter: { name: "Security Guard Ram", phone: "+91 98309 01234" },
            createdAt: Date.now() - 28 * 60 * 1000
        },

        // Blocked Storm Drain (P3)
        {
            reportId: "REP-W7-10",
            category: "DRAINAGE_OVERFLOW",
            description: "Major drainage canal blocked by fallen tree and plastic debris near Municipal Market.",
            location: "Ward 7 Municipal Market Canal",
            latitude: 22.5750,
            longitude: 88.3660,
            priority: "Medium",
            status: "Submitted",
            reporter: { name: "Market Association", phone: "+91 98310 12345" },
            createdAt: Date.now() - 70 * 60 * 1000
        },
        {
            reportId: "REP-W7-11",
            category: "DRAINAGE_OVERFLOW",
            description: "Drainage grates clogged at market corner, overflowing into shops.",
            location: "Ward 7 Market Gate 2",
            latitude: 22.5753,
            longitude: 88.3663,
            priority: "Medium",
            status: "Submitted",
            reporter: { name: "Shopkeeper Bikash", phone: "+91 98311 23456" },
            createdAt: Date.now() - 65 * 60 * 1000
        },

        // Street Puddle / Road Cavity (P3)
        {
            reportId: "REP-W7-12",
            category: "ROAD_HAZARD",
            description: "Large pothole submerged under water near Bus Stop 14 causing two-wheelers to fall.",
            location: "Central Avenue Bus Stop 14",
            latitude: 22.5715,
            longitude: 88.3690,
            priority: "Low",
            status: "Submitted",
            reporter: { name: "Commuter Joy", phone: "+91 98312 34567" },
            createdAt: Date.now() - 90 * 60 * 1000
        },

        // Additional community reports
        {
            reportId: "REP-W7-13",
            category: "FLOOD_RESCUE",
            description: "Family with twin infants stranded on terrace on 5th Cross Street.",
            location: "5th Cross Street, Ward 7",
            latitude: 22.5738,
            longitude: 88.3655,
            priority: "High",
            status: "Submitted",
            reporter: { name: "Moumita Sen", phone: "+91 98313 45678" },
            createdAt: Date.now() - 18 * 60 * 1000
        },
        {
            reportId: "REP-W7-14",
            category: "SANITATION_WASTE",
            description: "Garbage bin overturned by flood water spreading waste into residential street.",
            location: "Lane 9 Residential Sector",
            latitude: 22.5765,
            longitude: 88.3675,
            priority: "Low",
            status: "Submitted",
            reporter: { name: "Resident Welfare", phone: "+91 98314 56789" },
            createdAt: Date.now() - 110 * 60 * 1000
        },
        {
            reportId: "REP-W7-15",
            category: "ROAD_HAZARD",
            description: "Tree branch fallen across road blocking one lane near Girls High School.",
            location: "College Road near Girls High School",
            latitude: 22.5742,
            longitude: 88.3625,
            priority: "Medium",
            status: "Submitted",
            reporter: { name: "Traffic Volunteer", phone: "+91 98315 67890" },
            createdAt: Date.now() - 55 * 60 * 1000
        },
        {
            reportId: "REP-W7-16",
            category: "WATER_LOGGING",
            description: "Ground floor water logging in residential apartment building, lift shaft filled.",
            location: "Shanti Nilay Apartments, Ward 7",
            latitude: 22.5720,
            longitude: 88.3670,
            priority: "Medium",
            status: "Submitted",
            reporter: { name: "Society Secretary", phone: "+91 98316 78901" },
            createdAt: Date.now() - 85 * 60 * 1000
        },
        {
            reportId: "REP-W7-17",
            category: "FLOOD_RESCUE",
            description: "Water entered slum cluster behind railway line, 20 hutments inundated.",
            location: "Railway Colony Slum Sector",
            latitude: 22.5810,
            longitude: 88.3600,
            priority: "High",
            status: "Submitted",
            reporter: { name: "Local Counselor", phone: "+91 98317 89012" },
            createdAt: Date.now() - 42 * 60 * 1000
        },
        {
            reportId: "REP-W7-18",
            category: "POWER_OUTAGE",
            description: "Street lighting blackout across 4 blocks due to flooded feeder pillar.",
            location: "Block B & C Main Street",
            latitude: 22.5770,
            longitude: 88.3690,
            priority: "Low",
            status: "Submitted",
            reporter: { name: "Block Representative", phone: "+91 98318 90123" },
            createdAt: Date.now() - 130 * 60 * 1000
        },
        {
            reportId: "REP-W7-19",
            category: "DRAINAGE_OVERFLOW",
            description: "Sewer backflow contaminating drinking water supply tap on Ward 7 Lane 3.",
            location: "Lane 3 Public Standpost",
            latitude: 22.5745,
            longitude: 88.3640,
            priority: "High",
            status: "Submitted",
            reporter: { name: "Health Worker Asha", phone: "+91 98319 01234" },
            createdAt: Date.now() - 60 * 60 * 1000
        },
        {
            reportId: "REP-W7-20",
            category: "CIVIC_INFRASTRUCTURE",
            description: "Footbridge over drainage canal submerged and shaking under water pressure.",
            location: "Canal Footbridge, Ward 7",
            latitude: 22.5760,
            longitude: 88.3630,
            priority: "High",
            status: "Submitted",
            reporter: { name: "Citizen Alok", phone: "+91 98320 12345" },
            createdAt: Date.now() - 22 * 60 * 1000
        }
    ];

    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(REPORTS_FILE, JSON.stringify(reports, null, 2), "utf-8");

    // ========================================================
    // 2. 6 CANONICAL INCIDENTS (2x P1, 2x P2, 2x P3)
    // ========================================================
    const incidents = [];

    // --- P1 Incident 1: Flooded Primary School (Merged from 3 reports) ---
    const aiAnalysisP1A = validateAiAnalysis({
        category: "FLOOD_RESCUE",
        priorityRecommendation: "P1",
        confidence: 0.94,
        peopleAtRisk: 4,
        injuredPeople: 0,
        urgencySignals: ["trapped elderly", "rising floodwater", "school compound"],
        hazards: ["flash flood", "electrical shock risk"],
        recommendedResources: ["AMBULANCE", "BOAT", "RESCUE_TEAM"],
        summary: "Four elderly residents trapped on ground floor of Ward 7 Primary School with rising water.",
        explanation: ["Seniors unable to evacuate through surging water", "School compound acting as water basin"]
    });

    const scoreP1A = calculatePriorityScore({
        aiAnalysis: aiAnalysisP1A,
        peopleAtRisk: 4,
        severity: "CRITICAL",
        signals: ["trapped", "water rising", "elderly"],
        location: { text: "Ward 7 Primary School, School Road" },
        sourceReportCount: 3
    });

    const inc1 = buildCanonicalIncident({
        incidentId: "INC-2026-FLOOD-01",
        publicId: "CHRONIC-1042",
        title: "Flooded Ward 7 Primary School - Seniors Trapped",
        description: "Multiple corroborating reports confirm four elderly residents trapped on ground floor as floodwaters rise through School Road.",
        category: "FLOOD_RESCUE",
        location: { text: "Ward 7 Primary School, School Road", latitude: 22.5726, longitude: 88.3639, ward: "Ward 7" },
        sourceReportIds: ["REP-W7-01", "REP-W7-02", "REP-W7-03"],
        aiAnalysis: aiAnalysisP1A,
        priority: PriorityTier.P1,
        priorityScore: scoreP1A,
        status: IncidentStatus.VERIFIED
    });
    inc1.verification = {
        verified: true,
        verifiedBy: "officer_sharma",
        verifiedAt: Date.now() - 10 * 60 * 1000,
        notes: "Priority verified as P1 due to elderly victims and surging water level.",
        overrideReason: null
    };
    incidents.push(inc1);

    // --- P1 Incident 2: Elder Care Haven Submerged ---
    const aiAnalysisP1B = validateAiAnalysis({
        category: "FLOOD_RESCUE",
        priorityRecommendation: "P1",
        confidence: 0.96,
        peopleAtRisk: 12,
        injuredPeople: 2,
        urgencySignals: ["bedridden patients", "4 feet water", "oxygen support needed"],
        hazards: ["submerged facility", "hypothermia"],
        recommendedResources: ["AMBULANCE", "RESCUE_TEAM", "BOAT"],
        summary: "Elder Care Haven nursing facility submerged with 12 bedridden elderly patients requiring evacuation.",
        explanation: ["Bedridden victims unable to escape water", "Immediate patient transport required"]
    });

    const scoreP1B = calculatePriorityScore({
        aiAnalysis: aiAnalysisP1B,
        peopleAtRisk: 12,
        injuredPeople: 2,
        severity: "CRITICAL",
        signals: ["trapped", "medical casualties", "hospital", "elderly"],
        location: { text: "Elder Care Haven, Health Post Lane" },
        sourceReportCount: 2
    });

    const inc2 = buildCanonicalIncident({
        incidentId: "INC-2026-FLOOD-02",
        publicId: "CHRONIC-1043",
        title: "Submerged Care Facility - 12 Bedridden Patients",
        description: "Elder Care Haven nursing home on Health Post Lane has 4 feet of floodwater inside ground floor wards with 12 patients.",
        category: "FLOOD_RESCUE",
        location: { text: "Elder Care Haven, Health Post Lane", latitude: 22.5695, longitude: 88.3615, ward: "Ward 7" },
        sourceReportIds: ["REP-W7-04", "REP-W7-05"],
        aiAnalysis: aiAnalysisP1B,
        priority: PriorityTier.P1,
        priorityScore: scoreP1B,
        status: IncidentStatus.ASSIGNED
    });
    inc2.verification = {
        verified: true,
        verifiedBy: "officer_sharma",
        verifiedAt: Date.now() - 25 * 60 * 1000,
        notes: "Verified P1 medical evacuation emergency."
    };
    inc2.assignedResourceIds = ["ambulance_a12"];
    incidents.push(inc2);

    // --- P2 Incident 3: Collapsed River Embankment ---
    const aiAnalysisP2A = validateAiAnalysis({
        category: "BUILDING_COLLAPSE",
        priorityRecommendation: "P2",
        confidence: 0.88,
        peopleAtRisk: 0,
        injuredPeople: 0,
        urgencySignals: ["embankment wall collapse", "road cracked open"],
        hazards: ["structural breach", "landslide risk"],
        recommendedResources: ["RESCUE_TEAM", "HEAVY_RESCUE_TEAM"],
        summary: "Embankment retaining wall collapsed under river surge pressure near River Road bridge.",
        explanation: ["Structural collapse threatening transit lifeline", "Area cordoned off"]
    });

    const scoreP2A = calculatePriorityScore({
        aiAnalysis: aiAnalysisP2A,
        severity: "HIGH",
        signals: ["collapse", "river embankment", "road cracked"],
        location: { text: "River Road Embankment Km 3" },
        sourceReportCount: 2
    });

    const inc3 = buildCanonicalIncident({
        incidentId: "INC-2026-STRUCT-03",
        publicId: "CHRONIC-1044",
        title: "River Road Embankment Collapse",
        description: "Retaining wall breached along river curve. Road crack widening, threatening vehicles.",
        category: "BUILDING_COLLAPSE",
        location: { text: "River Road Embankment Km 3", latitude: 22.5780, longitude: 88.3580, ward: "Ward 7" },
        sourceReportIds: ["REP-W7-06", "REP-W7-07"],
        aiAnalysis: aiAnalysisP2A,
        priority: PriorityTier.P2,
        priorityScore: scoreP2A,
        status: IncidentStatus.NEEDS_VERIFICATION
    });
    incidents.push(inc3);

    // --- P2 Incident 4: Power Substation Ingress ---
    const aiAnalysisP2B = validateAiAnalysis({
        category: "POWER_OUTAGE",
        priorityRecommendation: "P2",
        confidence: 0.89,
        peopleAtRisk: 2,
        injuredPeople: 0,
        urgencySignals: ["water near high-voltage transformer", "sparks observed"],
        hazards: ["electrocution risk", "grid failure"],
        recommendedResources: ["RESCUE_TEAM", "FIRE_ENGINE"],
        summary: "Floodwater entering transformer yard at Sector 2 Substation.",
        explanation: ["Live electrical hazard requiring water pumping and grid de-energization"]
    });

    const scoreP2B = calculatePriorityScore({
        aiAnalysis: aiAnalysisP2B,
        severity: "HIGH",
        signals: ["power line", "live wire", "flood"],
        location: { text: "CESC Power Substation, Sector 2" },
        sourceReportCount: 2
    });

    const inc4 = buildCanonicalIncident({
        incidentId: "INC-2026-ELEC-04",
        publicId: "CHRONIC-1045",
        title: "Sector 2 Substation Flood Ingress Risk",
        description: "Rising floodwater threatening live transformers at Sector 2 Substation. Maintenance team requested urgent de-watering.",
        category: "POWER_OUTAGE",
        location: { text: "CESC Power Substation, Sector 2", latitude: 22.5820, longitude: 88.3710, ward: "Ward 7" },
        sourceReportIds: ["REP-W7-08", "REP-W7-09"],
        aiAnalysis: aiAnalysisP2B,
        priority: PriorityTier.P2,
        priorityScore: scoreP2B,
        status: IncidentStatus.PRIORITIZED
    });
    inc4.verification = {
        verified: true,
        verifiedBy: "officer_sharma",
        verifiedAt: Date.now() - 15 * 60 * 1000,
        notes: "Verified with electrical board superintendent."
    };
    incidents.push(inc4);

    // --- P3 Incident 5: Blocked Storm Drain Canal ---
    const aiAnalysisP3A = validateAiAnalysis({
        category: "DRAINAGE_OVERFLOW",
        priorityRecommendation: "P3",
        confidence: 0.82,
        peopleAtRisk: 0,
        injuredPeople: 0,
        urgencySignals: ["canal blocked", "market water logging"],
        hazards: ["debris blockage"],
        recommendedResources: ["RESCUE_TEAM", "SUPPLY"],
        summary: "Canal blocked by fallen tree and plastic debris near Municipal Market.",
        explanation: ["Drainage obstruction causing commercial street pooling"]
    });

    const scoreP3A = calculatePriorityScore({
        aiAnalysis: aiAnalysisP3A,
        severity: "MEDIUM",
        signals: ["debris", "drainage"],
        location: { text: "Ward 7 Municipal Market Canal" },
        sourceReportCount: 2
    });

    const inc5 = buildCanonicalIncident({
        incidentId: "INC-2026-DRAIN-05",
        publicId: "CHRONIC-1046",
        title: "Municipal Market Storm Canal Blockage",
        description: "Debris blockage preventing drainage run-off toward main outlet canal.",
        category: "DRAINAGE_OVERFLOW",
        location: { text: "Ward 7 Municipal Market Canal", latitude: 22.5750, longitude: 88.3660, ward: "Ward 7" },
        sourceReportIds: ["REP-W7-10", "REP-W7-11"],
        aiAnalysis: aiAnalysisP3A,
        priority: PriorityTier.P3,
        priorityScore: scoreP3A,
        status: IncidentStatus.NEEDS_VERIFICATION
    });
    incidents.push(inc5);

    // --- P3 Incident 6: Street Cavity on Central Avenue ---
    const aiAnalysisP3B = validateAiAnalysis({
        category: "ROAD_HAZARD",
        priorityRecommendation: "P3",
        confidence: 0.75,
        peopleAtRisk: 0,
        injuredPeople: 0,
        urgencySignals: ["submerged pothole"],
        hazards: ["road hazard"],
        recommendedResources: ["SUPPLY"],
        summary: "Submerged cavity near Central Avenue Bus Stop 14.",
        explanation: ["Traffic hazard requiring road barricade"]
    });

    const scoreP3B = calculatePriorityScore({
        aiAnalysis: aiAnalysisP3B,
        severity: "LOW",
        signals: ["pothole", "asphalt"],
        location: { text: "Central Avenue Bus Stop 14" },
        sourceReportCount: 1
    });

    const inc6 = buildCanonicalIncident({
        incidentId: "INC-2026-ROAD-06",
        publicId: "CHRONIC-1047",
        title: "Central Avenue Submerged Road Cavity",
        description: "Deep cavity obscured by flood puddle on Central Avenue near Bus Stop 14.",
        category: "ROAD_HAZARD",
        location: { text: "Central Avenue Bus Stop 14", latitude: 22.5715, longitude: 88.3690, ward: "Ward 7" },
        sourceReportIds: ["REP-W7-12"],
        aiAnalysis: aiAnalysisP3B,
        priority: PriorityTier.P3,
        priorityScore: scoreP3B,
        status: IncidentStatus.NEEDS_VERIFICATION
    });
    incidents.push(inc6);

    for (const inc of incidents) {
        await saveIncident(inc);
    }

    // ========================================================
    // 3. RESOURCES (4 Ambulances, 3 Rescue Teams, 3 Shelters, 2 Hospitals)
    // ========================================================
    const resources = [
        // 4 Ambulances
        buildResource({
            id: "ambulance_a12",
            name: "Ambulance A-12 (Critical Life Support)",
            type: ResourceType.AMBULANCE,
            status: ResourceStatus.DISPATCHED,
            capabilities: ["OXYGEN", "FIRST_AID", "PATIENT_TRANSPORT", "VENTILATOR"],
            capacity: 4,
            location: { latitude: 22.5710, longitude: 88.3620, address: "Ward 7 Central Hospital", ward: "Ward 7" },
            contact: "+91 98300 00012"
        }),
        buildResource({
            id: "ambulance_a09",
            name: "Ambulance A-09 (Standard Transport)",
            type: ResourceType.AMBULANCE,
            status: ResourceStatus.AVAILABLE,
            capabilities: ["FIRST_AID", "PATIENT_TRANSPORT"],
            capacity: 3,
            location: { latitude: 22.5850, longitude: 88.3750, address: "Sector 2 Health Post", ward: "Ward 7" },
            contact: "+91 98300 00009"
        }),
        buildResource({
            id: "ambulance_a03",
            name: "Ambulance A-03 (Mobile ICU)",
            type: ResourceType.AMBULANCE,
            status: ResourceStatus.AVAILABLE,
            capabilities: ["OXYGEN", "FIRST_AID", "PATIENT_TRANSPORT", "CARDIAC_MONITOR"],
            capacity: 2,
            location: { latitude: 22.5650, longitude: 88.3600, address: "North Suburban Clinic", ward: "Ward 7" },
            contact: "+91 98300 00003"
        }),
        buildResource({
            id: "ambulance_a15",
            name: "Ambulance A-15 (Patient Transit)",
            type: ResourceType.AMBULANCE,
            status: ResourceStatus.MAINTENANCE,
            capabilities: ["PATIENT_TRANSPORT"],
            capacity: 4,
            location: { latitude: 22.5690, longitude: 88.3580, address: "Central Depot Workshop", ward: "Ward 7" },
            contact: "+91 98300 00015"
        }),

        // 3 Rescue Teams
        buildResource({
            id: "rescue_r04",
            name: "Rescue Team R-04 (Water & Flood Specialist)",
            type: ResourceType.RESCUE_TEAM,
            status: ResourceStatus.AVAILABLE,
            capabilities: ["WATER_RESCUE", "SEARCH_AND_RESCUE", "HEAVY_CUTTING", "FIRST_AID"],
            capacity: 8,
            location: { latitude: 22.5740, longitude: 88.3680, address: "Civil Defense Station 1", ward: "Ward 7" },
            contact: "+91 98300 00104"
        }),
        buildResource({
            id: "rescue_r01",
            name: "Rescue Team R-01 (Urban Search Unit)",
            type: ResourceType.RESCUE_TEAM,
            status: ResourceStatus.AVAILABLE,
            capabilities: ["SEARCH_AND_RESCUE", "FIRST_AID", "DEBRIS_REMOVAL"],
            capacity: 6,
            location: { latitude: 22.5700, longitude: 88.3650, address: "Ward 7 Fire Station", ward: "Ward 7" },
            contact: "+91 98300 00101"
        }),
        buildResource({
            id: "cutter_h01",
            name: "Heavy Rescue Unit H-01 (Debris Clearance)",
            type: ResourceType.RESCUE_TEAM,
            status: ResourceStatus.AVAILABLE,
            capabilities: ["HEAVY_CUTTING", "DEBRIS_REMOVAL", "WINCHING"],
            capacity: 4,
            location: { latitude: 22.5780, longitude: 88.3690, address: "PWD Heavy Machinery Yard", ward: "Ward 7" },
            contact: "+91 98300 00105"
        }),

        // 3 Evacuation Shelters
        buildResource({
            id: "shelter_s01",
            name: "Ward 7 Community Hall Evacuation Shelter",
            type: ResourceType.SHELTER,
            status: ResourceStatus.AVAILABLE,
            capabilities: ["BEDS", "CLEAN_WATER", "FIRST_AID", "KITCHEN"],
            capacity: 150,
            location: { latitude: 22.5680, longitude: 88.3650, address: "Community Hall Ward 7", ward: "Ward 7" },
            contact: "+91 98300 00201"
        }),
        buildResource({
            id: "shelter_s02",
            name: "Girls High School Flood Relief Camp",
            type: ResourceType.SHELTER,
            status: ResourceStatus.AVAILABLE,
            capabilities: ["BEDS", "FOOD_SUPPLY", "FIRST_AID"],
            capacity: 200,
            location: { latitude: 22.5742, longitude: 88.3625, address: "College Road Girls School", ward: "Ward 7" },
            contact: "+91 98300 00202"
        }),
        buildResource({
            id: "shelter_s03",
            name: "Youth Sports Complex Emergency Refuge",
            type: ResourceType.SHELTER,
            status: ResourceStatus.AVAILABLE,
            capabilities: ["MASS_SHELTER", "GENERATOR_POWER", "CLEAN_WATER"],
            capacity: 350,
            location: { latitude: 22.5800, longitude: 88.3730, address: "Sector 3 Stadium Ground", ward: "Ward 7" },
            contact: "+91 98300 00203"
        })
    ];

    for (const res of resources) {
        await saveResource(res);
    }

    // ========================================================
    // 4. 2 BLOCKED ROADS
    // ========================================================
    await saveRoadClosure({
        id: "rc_barrackpore_km14",
        roadName: "Barrackpore Highway Km 14 Underpass",
        latitude: 22.7500,
        longitude: 88.3500,
        reason: "Submerged under 1.2 meters of flood run-off. Impassable for low-clearance vehicles.",
        incidentId: "INC-2026-FLOOD-01",
        reportedBy: "Field Unit Alpha",
        reportedAt: Date.now() - 30 * 60 * 1000
    });

    await saveRoadClosure({
        id: "rc_river_road_km3",
        roadName: "River Road Embankment Curve",
        latitude: 22.5780,
        longitude: 88.3580,
        reason: "Retaining wall breach and road fissure. Cordoned off by police.",
        incidentId: "INC-2026-STRUCT-03",
        reportedBy: "Traffic Police Ward 7",
        reportedAt: Date.now() - 40 * 60 * 1000
    });

    // ========================================================
    // 5. 1 ACTIVE DISPATCH MISSION
    // ========================================================
    const mission = buildMission({
        id: "MSN-WARD7-01",
        incidentId: "INC-2026-FLOOD-02",
        resourceId: "ambulance_a12",
        assignedTo: "worker_amit_unit1",
        status: MissionStatus.IN_PROGRESS,
        etaMinutes: 8,
        routeRisk: "MEDIUM",
        notes: "Dispatched to Elder Care Haven. Water depth ~3.5 ft at gate. Avoid River Road Underpass.",
        dispatchedBy: "Officer Sharma"
    });
    mission.events.push({
        type: "MISSION_STATUS_UPDATED",
        status: MissionStatus.ARRIVED,
        previousStatus: MissionStatus.ASSIGNED,
        actor: "Responder Amit",
        timestamp: Date.now() - 12 * 60 * 1000,
        notes: "Arrived at nursing facility. First 4 patients stabilized for transfer."
    });
    await saveMission(mission);

    console.log("Ward 7 Flash Flood Scenario seeded successfully!");
    return {
        reportsCount: reports.length,
        incidentsCount: incidents.length,
        resourcesCount: resources.length,
        missionsCount: 1,
        roadClosuresCount: 2
    };
}

// Enable direct CLI execution
if (process.argv[1] && process.argv[1].endsWith("ward7-scenario.js")) {
    seedWard7Scenario().then((stats) => {
        console.log("Seed summary:", JSON.stringify(stats, null, 2));
        process.exit(0);
    }).catch((err) => {
        console.error("Seed error:", err);
        process.exit(1);
    });
}
