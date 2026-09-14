# ChronicAI — Full System Architecture, Page Catalog & API Specification
**Autonomous Civic Triage, Disaster Incident Management & Emergency Response Network**
*Version: 2.4.0-Production | Published: September 2026*

---

## Table of Contents
1. [Executive Summary & System Overview](#1-executive-summary--system-overview)
2. [Complete Project Directory Structure](#2-complete-project-directory-structure)
3. [Page Catalog & Frontend Architecture (All 15 Pages)](#3-page-catalog--frontend-architecture-all-15-pages)
4. [Exhaustive REST API Reference & Specification](#4-exhaustive-rest-api-reference--specification)
5. [Core Architectural Engines & Subsystems](#5-core-architectural-engines--subsystems)
6. [Data Models & Persistence Schemas](#6-data-models--persistence-schemas)
7. [Deployment, Clustered HA Supervisor & DevOps](#7-deployment-clustered-ha-supervisor--devops)
8. [Environment Variables & Configuration Guide](#8-environment-variables--configuration-guide)

---

## 1. Executive Summary & System Overview

**ChronicAI** is an enterprise-grade autonomous municipal triage and disaster incident response network designed to bridge the operational gap between citizens on the ground, field response personnel, and district emergency command centers (EOC).

### Core Problem Solved
During civic crises, structural emergencies, and natural disasters (flash floods, earthquakes, landslides, severe weather):
- **Communication Breakdown**: Citizens overwhelm emergency lines with fragmented, duplicate, and unverified hazard filings.
- **Triage Delay**: Municipal officers lack real-time AI severity scoring, causing delay in triaging life-critical (P1/P2) incidents over non-critical infrastructure decay.
- **Resource Misallocation**: First responders (NDRF squads, ambulances, rescue boats) are dispatched blindly without spatial distance calculation or equipment capability matching.
- **Offline Disconnect**: In disaster zones where cell towers fail, field workers are cut off from central dispatch.

### ChronicAI Solution Pillars
1. **Multimodal Citizen Reporting**: Citizens file geotagged photo reports with GPS coordinates, damage descriptions, and casualty counts.
2. **Autonomous AI Severity Triage**: Integrated Google Gemini AI (with deterministic heuristic fallback) analyzes visual evidence and incident descriptions to calculate confidence scores, hazard tiers (P1-P4), and required agency equipment.
3. **Duplicate Detection & Spatial Clustering**: Haversine distance calculations and temporal windows automatically group reports into canonical incidents, preventing redundant dispatches.
4. **Automated Resource Allocation**: Recommends top-3 optimal response assets based on capability matrices, distance, and current deployment status.
5. **Idempotent Offline Field Synchronization**: Field teams queue actions locally and perform deterministic batch synchronization upon network reconnection.
6. **National GIS Disaster Radar**: Real-time Leaflet GIS mapping visualizing meteorological hazards, disaster zones, road closures, and responder telematics.

---

## 2. Complete Project Directory Structure

```text
Chronic-/
│
├── api/                                # Serverless & Edge API Wrappers
│   └── index.js                        # Vercel serverless function entry delegating to server runtime
│
├── assets/                             # PWA Assets & Service Worker Config
│   ├── manifest.json                   # Progressive Web App configuration
│   └── service-worker.js               # Background cache & offline service worker
│
├── components/                         # Reusable UI Component Library
│   └── ui/
│       ├── auth-switch.tsx             # Interactive authentication toggle component
│       ├── chronic-hero.tsx            # Animated Framer Motion hero component
│       ├── demo.tsx                    # Component showcase harness
│       ├── index.tsx                   # Component library barrel exports
│       ├── prisma-hero.tsx             # 3D WebGL / Canvas interactive hero component
│       └── sign-in-page.tsx            # Split-screen responsive sign-in page component
│
├── data/                               # Local File-Based Persistence Store (JSON Database)
│   ├── incidents.json                  # Canonical incidents registry with audit trails
│   ├── missions.json                   # Dispatched response missions & responder assignments
│   ├── reports.json                    # Citizen raw incident filings
│   ├── resources.json                  # Registered municipal emergency response assets
│   ├── road-closures.json              # Active field roadblocks & hazard routes
│   └── sync-operations.json            # Offline idempotent sync ledger & replay logs
│
├── docs/                               # Project Documentation & Architectural Guides
│   ├── ARCHITECTURE-AND-FLOW-DESIGN.md # System flowcharts and domain diagrams
│   ├── CHRONICAI-FULL-SYSTEM-DOCUMENTATION.md # Master system documentation (this file)
│   ├── ChronicAI-Full-System-Documentation.docx # Formatted Word documentation
│   ├── PRODUCT-DOCUMENTATION.md        # Product requirement breakdown
│   └── PROJECT-STRUCTURE.md            # Directory structure notes
│
├── public/                             # Public Web Root (Served to Client)
│   ├── assets/                         # Public-facing PWA manifest and service workers
│   ├── css/                            # Cascading Style Sheets & Design System
│   │   ├── admin-dashboard.css         # EOC command center styling
│   │   ├── design-tokens.css           # Global CSS custom properties (colors, fonts, radii)
│   │   ├── emergency-map.css           # Tactical Leaflet GIS map controls & overlays
│   │   ├── global.css                  # Core typography, resets, container shells
│   │   ├── prisma-hero.css             # Hero 3D HUD, glassmorphism, mobile responsiveness
│   │   ├── report.css                  # Incident filing form styling
│   │   ├── request.css                 # Emergency aid request styling
│   │   ├── resource-center.css         # Shelter inventory & logistics styles
│   │   ├── risk-dashboard.css          # Meteorological hazard risk dashboard styles
│   │   ├── support.css                 # Citizen donation & volunteer corps styles
│   │   └── theme-sync.css              # Universal Day/Night theme synchronization styles
│   ├── html/                           # 15 Application HTML Entry Points
│   │   ├── admin-dashboard.html        # EOC Authority Command Console
│   │   ├── admin-login.html            # Two-Factor Email OTP Authority Login
│   │   ├── complaint.html              # Individual Incident Audit & Resolution Details
│   │   ├── index.html                  # Main Public Landing Page & Disaster Operations
│   │   ├── journey.html                # Citizen Reporting Lifecycle Walkthrough
│   │   ├── life-helper.html            # AI Disaster Survival & First-Aid Protocol Desk
│   │   ├── login.html                  # Citizen & Responder Split-Screen Sign-In
│   │   ├── missing-persons.html        # Civilian Missing Persons Registry
│   │   ├── register.html               # Citizen Enrollment & Profile Verification
│   │   ├── report-problem.html         # Citizen Geotagged Incident Filing
│   │   ├── request.html                # Direct Emergency Distress & Aid Request
│   │   ├── resource-center.html        # Relief Camps, Shelters & Supply Directory
│   │   ├── risk-dashboard.html         # Environmental Risk & Meteorological Analytics
│   │   ├── support.html                # Donations, Supplies & Volunteer Portal
│   │   └── track.html                  # Public Incident & Rescue Telematics Tracking
│   ├── icons/                          # Application favicons and vector icons
│   ├── images/                         # Tactical imagery, background assets & command visuals
│   │   ├── auth-command-center.jpg     # Futuristic EOC command center visual
│   │   ├── footer-civic-day.jpg        # Panoramic daytime resilience visual
│   │   ├── footer-civic-night.jpg      # Panoramic nighttime twilight emergency visual
│   │   └── hero-command-center.jpg     # High-res central operations room visual
│   └── js/                             # Client-Side JavaScript Logic
│       ├── admin-dashboard.js          # EOC live feed, verification & dispatch logic
│       ├── admin-login.js              # OTP countdown & verification handler
│       ├── auth-guard.js               # Route protection & session state validation
│       ├── emergency-map.js            # Tactical GIS Leaflet mapping engine
│       ├── field-offline-sync.js       # IndexedDB offline action queue & auto-sync
│       ├── firebase-client.js          # Firebase client SDK initialization
│       ├── hero-3d.js                  # Three.js WebGL digital twin background canvas
│       ├── journey.js                  # Interactive citizen flow visualizer
│       ├── login.js                    # Firebase Auth login, OAuth & demo auto-fill
│       ├── missing-persons.js          # Missing persons search & registry submission
│       ├── register.js                 # Citizen registration & profile creation
│       ├── report-problem.js           # Camera capture, GPS locator & AI preview
│       ├── request.js                  # Emergency aid form submission & validation
│       ├── rescue-tracking.js          # Dispatched rescue units telematics polling
│       ├── resource-center.js          # Shelter filtering, search & GIS mapping
│       ├── risk-dashboard.js           # Weather APIs & flood risk chart visualizer
│       ├── support.js                  # Donation categories & volunteer enrollment
│       └── theme-manager.js            # Universal Day/Night theme switcher & sync
│
├── server/                             # Backend Server Architecture
│   ├── domain/                         # Enterprise Domain Entities & State Machines
│   │   ├── incident.js                 # Incident entity, status rules & event logging
│   │   ├── operations.js               # Mission & Resource entity factories
│   │   └── sync.js                     # Sync operation schema & validation
│   ├── routes/                         # Express Route Handlers
│   │   ├── incidents.js                # Incident management & scoring endpoints
│   │   ├── missions.js                 # Mission dispatch & status progression endpoints
│   │   ├── resources.js                # Resource registry & allocation endpoints
│   │   └── sync.js                     # Offline batch push & delta pull endpoints
│   ├── seed/                           # Automated Simulation & Disaster Scenarios
│   │   └── ward7-scenario.js           # Comprehensive Ward 7 flash flood scenario seeder
│   ├── services/                       # Business Logic & Computational Engines
│   │   ├── ai-validation.js            # Gemini AI validation & heuristic fallback
│   │   ├── allocation-service.js       # Top-3 resource recommendation engine
│   │   ├── briefing-service.js         # Operational SitRep briefing generator
│   │   ├── duplicate-detector.js       # Haversine spatial duplicate detector
│   │   ├── incident-service.js         # Incident lifecycle & persistence operations
│   │   ├── mission-service.js          # Mission execution & status synchronization
│   │   ├── priority-engine.js          # Multi-dimensional P1-P4 priority scoring
│   │   └── sync-service.js             # Idempotent offline replay & delta calculator
│   ├── email-service.js                # SMTP email delivery for OTP codes & notifications
│   ├── firebase.js                     # Express application, middleware & route mounter
│   ├── otp-service.js                  # In-memory OTP code generation, expiration & rate limiting
│   └── server.js                       # Clustered High-Availability process supervisor
│
├── test/                               # Automated Test Suite (Node.js Native Test Runner)
│   ├── allocation.test.js              # Resource recommendation tests
│   ├── duplicates.test.js              # Haversine proximity & duplicate clustering tests
│   ├── incident.test.js                # Incident state transitions & verification tests
│   ├── missions.test.js                # Mission dispatch & idempotency tests
│   ├── priority.test.js                # Priority tier computation & override tests
│   ├── scenario.test.js                # Ward 7 scenario seeding & briefing tests
│   └── sync.test.js                    # Offline push/pull idempotency tests
│
├── .env.example                        # Environment variables template
├── database.rules.json                 # Firebase Realtime Database security rules
├── package.json                        # Node.js project manifest, scripts & dependencies
├── render.yaml                         # Render.com cloud deployment blueprint
├── storage.rules                       # Firebase Cloud Storage access rules
├── tsconfig.json                       # TypeScript compiler options
└── vercel.json                         # Vercel edge deployment configuration & URL rewrites
```

---

## 3. Page Catalog & Frontend Architecture (All 15 Pages)

| Page File | Primary Route | Purpose & Functionality | Key Interacting Scripts | Backend Endpoints Consumed | User Persona |
|:---|:---|:---|:---|:---|:---|
| `index.html` | `/`, `/index` | Main public landing page. Features interactive 3D digital twin, municipal floating/mobile capsule navbar, EOC telemetry HUD with surveillance camera angles, live casualty statistics strip, capabilities grid, support CTA plate, tactical Leaflet disaster radar map, and panoramic bi-directional melting footer. | `theme-manager.js`, `auth-guard.js`, `emergency-map.js` | `GET /api/reports`, `GET /api/dashboard/briefing`, `GET /api/incidents` | Public Citizens, Responders, Officers |
| `login.html` | `/login` | High-fidelity split-screen sign-in portal. Left panel features photorealistic EOC command visual with live district telemetry pill; right panel features email/password inputs, 1-click demo auto-fill (`demo@localhost`), password visibility toggles, Google/GitHub OAuth triggers, and Day/Night theme controls. | `login.js`, `theme-manager.js`, `firebase-client.js` | Firebase Client Auth, `POST /api/auth/send-otp` | Registered Citizens & Field Responders |
| `register.html` | `/register` | Symmetrical split-screen enrollment portal. Captures verified citizen name, contact email, and secure password with confirmation check and municipal terms agreement. | `register.js`, `theme-manager.js`, `firebase-client.js` | Firebase Client Auth | New Citizens & Volunteers |
| `admin-login.html` | `/admin-login` | Two-factor authority portal login for government officers. Implements two-step flow: Step 1 verifies government email and sends cryptographic 6-digit OTP; Step 2 verifies time-expiring OTP with 15-minute validity and session authorization. | `admin-login.js`, `theme-manager.js` | `POST /api/auth/send-otp`, `POST /api/auth/verify-otp`, `GET /api/auth/email-health` | Authorized Government Officers, EOC Directors |
| `admin-dashboard.html` | `/admin-dashboard` | Mission command console. Displays district SitRep briefing, active canonical incidents table, P1-P4 priority tier badges, duplicate merge dialogs, resource recommendation modal, and live Ward 7 disaster simulation seed button. | `admin-dashboard.js`, `theme-manager.js`, `auth-guard.js` | `GET /api/incidents`, `POST /api/incidents/:id/verify`, `POST /api/incidents/:id/merge`, `GET /api/resources/recommend/:id`, `POST /api/missions`, `POST /api/dashboard/seed-ward7` | EOC Incident Commanders, Triage Officers |
| `report-problem.html` | `/report-problem` | Official citizen incident filing form (Form INC-F01). Supports device camera photo evidence upload, GPS geolocation pinning, structural category selection (breach, collapse, road washout), casualty counts, and real-time AI damage triage preview. | `report-problem.js`, `theme-manager.js`, `auth-guard.js` | `POST /api/analyze`, `POST /api/reports`, `POST /api/incidents` | Public Citizens, Field Workers |
| `complaint.html` | `/complaint` | Individual incident filing audit record. Displays complete submission parameters, high-res damage imagery, AI confidence score, municipal verification status, responding agency assignment, and chronological action timeline. | `complaint.js`, `theme-manager.js` | `GET /api/reports/:reportId`, `GET /api/reports/:reportId/timeline` | Filing Citizens, Assigned Officers |
| `track.html` | `/track` | Real-time incident tracking console. Visualizes multi-stage resolution progress bar (Logged → AI Triage → Officer Verified → Units En Route → Resolved), incident map pin, and active telematics telemetry of dispatched rescue vehicles. | `rescue-tracking.js`, `theme-manager.js` | `GET /api/reports/:reportId`, `GET /api/missions`, `GET /api/sync/road-closures` | Citizens, Public Monitoring |
| `request.html` | `/request` | Direct emergency aid and distress dispatch portal. Designed for individuals trapped in flood zones requiring immediate rescue boats, clean drinking water, food rations, or emergency medical evacuation. | `request.js`, `theme-manager.js` | `POST /api/emergency-requests` | Trapped Victims, Vulnerable Citizens |
| `resource-center.html` | `/resource-center` | Public emergency logistics & relief directory. Features searchable, filterable grid of operational relief shelters, emergency medical stations, food kitchens, and potable water points across districts with occupancy rates. | `resource-center.js`, `theme-manager.js` | `GET /api/resources` | Displaced Citizens, Relief Agencies |
| `missing-persons.html` | `/missing-persons` | Civil registry for missing and displaced persons. Enables citizens to register missing relatives with physical attributes and last-known GPS coordinates; cross-references autonomous hospital admissions and shelter check-in rolls. | `missing-persons.js`, `theme-manager.js` | `GET /api/reports`, `POST /api/reports` | Citizens, Family Members, Red Cross |
| `risk-dashboard.html` | `/risk-dashboard` | Meteorological hazard & environmental risk analytics desk. Connects to real-time weather telematics to display flood inundation projections, wind gusts, structural decay indexes, and district risk heatmaps. | `risk-dashboard.js`, `theme-manager.js` | `GET /api/risk` | City Engineers, Disaster Planners |
| `life-helper.html` | `/life-helper` | Offline-ready AI first-aid and survival protocol desk. Contains emergency triage guides for treating fractures, burns, hypothermia, clean water purification, and interactive survival checklist during utility blackouts. | `theme-manager.js` | `POST /api/chat` | All Citizens in Crisis Situations |
| `support.html` | `/support` | Civic contribution and volunteer mobilization hub. Facilitates direct municipal relief fund contributions, physical supply donations (rations, blankets, medical kits), and accredited volunteer corps sign-ups. | `support.js`, `theme-manager.js` | `POST /api/support-requests`, `GET /api/admin/support-requests` | Donors, Civic Volunteers, NGOs |
| `journey.html` | `/journey` | Interactive citizen impact walkthrough. Illustrates end-to-end flow from initial citizen photo capture on mobile through AI triage, EOC verification, fleet dispatch, and road re-opening. | `journey.js`, `theme-manager.js` | Static / Demo Simulator | Educational, Civic Observers |

---

## 4. Exhaustive REST API Reference & Specification

### 4.1. Incident Management APIs (`/api/incidents`)

#### `GET /api/incidents`
- **Purpose**: Fetch paginated, filterable list of canonical incidents.
- **Access**: Public / Authenticated Officers
- **Query Parameters**:
  - `status` (*string*, optional): Filter by `NEW`, `VERIFIED`, `ASSIGNED`, `IN_PROGRESS`, `RESOLVED`, `REJECTED`.
  - `priority` (*string*, optional): Filter by `P1`, `P2`, `P3`, `P4`.
  - `category` (*string*, optional): Filter by `flood`, `infrastructure`, `medical`, `fire`, `landslide`.
  - `q` (*string*, optional): Free-text search matching title, description, or address.
  - `limit` (*integer*, optional, default: 50, max: 100): Page size.
  - `offset` (*integer*, optional, default: 0): Pagination offset.
- **Response Format (200 OK)**:
```json
{
  "success": true,
  "total": 42,
  "count": 1,
  "incidents": [
    {
      "incidentId": "INC-2026-001",
      "title": "Severe Embankment Breach at Ward 7",
      "description": "Rising water breaching primary earthen levee.",
      "category": "flood",
      "priority": "P1",
      "status": "VERIFIED",
      "location": {
        "latitude": 22.5726,
        "longitude": 88.3639,
        "address": "Sector 4, Ward 7 Floodplain"
      },
      "casualties": { "dead": 0, "injured": 4, "trapped": 28 },
      "priorityScore": 88,
      "sourceReportIds": ["REP-101", "REP-102"],
      "createdAt": 1789120000000,
      "updatedAt": 1789120500000
    }
  ]
}
```

#### `GET /api/incidents/:id`
- **Purpose**: Retrieve full details and event audit history of a specific canonical incident.
- **Access**: Public / Officers
- **Path Parameters**: `id` (*string*, required): Incident ID.
- **Response Format (200 OK / 404 Not Found)**:
```json
{
  "success": true,
  "incident": {
    "incidentId": "INC-2026-001",
    "status": "VERIFIED",
    "events": [
      {
        "eventId": "EVT-01",
        "type": "INCIDENT_CREATED",
        "timestamp": 1789120000000,
        "actor": { "id": "officer_1", "role": "government_officer" }
      }
    ]
  }
}
```

#### `POST /api/incidents`
- **Purpose**: Create a new canonical incident with structured AI validation and priority scoring.
- **Headers**: `Idempotency-Key` (*optional*): Prevents duplicate submissions.
- **Request Body**:
```json
{
  "title": "Bridge Structural Fracture",
  "description": "Visible fissure across support pillar near river crossing.",
  "category": "infrastructure",
  "priority": "P2",
  "location": {
    "latitude": 22.5801,
    "longitude": 88.3712,
    "address": "North Bypass Overpass"
  },
  "casualties": { "dead": 0, "injured": 0, "trapped": 0 },
  "sourceReportIds": ["REP-505"]
}
```
- **Response Format (201 Created)**: Returns the initialized canonical incident object.

#### `POST /api/incidents/:id/verify`
- **Purpose**: Government officer verification workflow; promotes incident from `NEW` to `VERIFIED` and optionally overrides priority tier.
- **Headers**: `Idempotency-Key` (*optional*), `x-local-admin` or Government Bearer Token.
- **Request Body**:
```json
{
  "priority": "P1",
  "overrideJustification": "Critical evacuation route at risk of immediate structural failure.",
  "assignedDepartment": "NDRF & Civil Engineering Bureau",
  "notes": "Fast-tracked verification based on ground inspect camera feed."
}
```
- **Response Format (200 OK)**: Returns updated incident with appended `OFFICER_VERIFIED` event.

#### `POST /api/incidents/:id/reject`
- **Purpose**: Reject a spurious, fraudulent, or resolved incident.
- **Request Body**:
```json
{
  "reason": "Duplicate filing; water already subsided.",
  "notes": "Verified via drone reconnaissance."
}
```

#### `GET /api/incidents/:id/duplicate-candidates`
- **Purpose**: Detect nearby incidents within spatial radius (default 500m) and temporal window (default 24h) for potential merging.
- **Response Format (200 OK)**:
```json
{
  "success": true,
  "incidentId": "INC-2026-001",
  "candidateCount": 2,
  "candidates": [
    {
      "incidentId": "INC-2026-004",
      "distanceMeters": 142.5,
      "timeDifferenceMinutes": 18,
      "similarityScore": 0.94
    }
  ]
}
```

#### `POST /api/incidents/:id/merge`
- **Purpose**: Consolidate one or more duplicate incidents into the primary incident without data loss, merging source reports and casualty tallies.
- **Request Body**:
```json
{
  "sourceIncidentIds": ["INC-2026-004", "INC-2026-007"],
  "notes": "Consolidated duplicate flood breach filings."
}
```

---

### 4.2. Resource Registry & Allocation APIs (`/api/resources`)

#### `GET /api/resources`
- **Purpose**: List registered municipal response assets and availability status.
- **Query Parameters**: `type` (`AMBULANCE`, `BOAT`, `ENGINEERING`, `SHELTER`, `MEDICAL_SQUAD`), `status` (`AVAILABLE`, `DISPATCHED`, `MAINTENANCE`).
- **Response Format (200 OK)**:
```json
{
  "success": true,
  "total": 14,
  "resources": [
    {
      "id": "RES-BOAT-01",
      "name": "NDRF Flood Inflatable Rescue Boat 04",
      "type": "BOAT",
      "status": "AVAILABLE",
      "capacity": 12,
      "location": { "latitude": 22.5698, "longitude": 88.3587 },
      "capabilities": ["water_rescue", "shallow_draft", "evacuation"]
    }
  ]
}
```

#### `GET /api/resources/recommend/:incidentId`
- **Purpose**: Algorithmic Top-3 resource recommendation engine for an incident based on distance, equipment capabilities, and operational urgency.
- **Path Parameters**: `incidentId` (*string*, required).
- **Query Parameters**: `limit` (*integer*, default: 3).
- **Response Format (200 OK)**:
```json
{
  "success": true,
  "incidentId": "INC-2026-001",
  "recommendationCount": 3,
  "recommendations": [
    {
      "resourceId": "RES-BOAT-01",
      "name": "NDRF Flood Inflatable Rescue Boat 04",
      "type": "BOAT",
      "score": 94.5,
      "distanceKm": 1.24,
      "estimatedTravelMinutes": 8,
      "matchingCapabilities": ["water_rescue", "evacuation"],
      "reasons": ["Closest verified boat squad", "High water evacuation capacity"]
    }
  ]
}
```

#### `PATCH /api/resources/:id/status`
- **Purpose**: Update operational availability status of a resource (`AVAILABLE`, `DISPATCHED`, `UNAVAILABLE`).

---

### 4.3. Mission Dispatch & Execution APIs (`/api/missions`)

#### `POST /api/missions`
- **Purpose**: Atomically dispatch an emergency resource to an incident with idempotency guarantee. Transitions resource status to `DISPATCHED` and incident to `ASSIGNED`.
- **Headers**: `Idempotency-Key` (*recommended*).
- **Request Body**:
```json
{
  "incidentId": "INC-2026-001",
  "resourceId": "RES-BOAT-01",
  "assignedTo": "field_worker_bravo_07",
  "etaMinutes": 12,
  "routeRisk": "LOW",
  "notes": "Deploy to North Bank levee breach."
}
```
- **Response Format (201 Created)**:
```json
{
  "success": true,
  "message": "Mission MSN-2026-108 dispatched successfully.",
  "mission": {
    "id": "MSN-2026-108",
    "incidentId": "INC-2026-001",
    "resourceId": "RES-BOAT-01",
    "status": "DISPATCHED",
    "dispatchedAt": 1789121000000
  },
  "resource": { "id": "RES-BOAT-01", "status": "DISPATCHED" },
  "incident": { "incidentId": "INC-2026-001", "status": "ASSIGNED" }
}
```

#### `PATCH /api/missions/:id/status`
- **Purpose**: Advance mission lifecycle through strict valid state progression:
  `DISPATCHED` → `EN_ROUTE` → `ARRIVED` → `IN_PROGRESS` → `COMPLETED` (or `BLOCKED` / `ABORTED`).
- **Request Body**:
```json
{
  "status": "ARRIVED",
  "notes": "Unit arrived on site; beginning perimeter evacuation."
}
```

---

### 4.4. Offline Field Synchronization APIs (`/api/sync`)

#### `POST /api/sync/push`
- **Purpose**: Batch upload queued offline operations executed by field workers while disconnected from cellular network. Supports idempotent replays.
- **Request Body**:
```json
{
  "operations": [
    {
      "operationId": "OP-SYNC-8801",
      "type": "UPDATE_MISSION_STATUS",
      "missionId": "MSN-2026-108",
      "status": "COMPLETED",
      "timestamp": 1789122000000,
      "payload": { "rescuedCount": 14 }
    },
    {
      "operationId": "OP-SYNC-8802",
      "type": "REPORT_ROAD_CLOSURE",
      "location": { "latitude": 22.5711, "longitude": 88.3610 },
      "reason": "Severe standing water 1.5m deep",
      "timestamp": 1789122050000
    }
  ]
}
```
- **Response Format (200 OK)**: Returns count of applied, skipped (idempotent duplicate), and failed operations.

#### `GET /api/sync/pull`
- **Purpose**: Delta synchronization endpoint. Returns all incidents, missions, and road closures updated since given timestamp.
- **Query Parameters**: `sinceTimestamp` (*integer*, epoch ms), `assignedTo` (*string*, optional).

#### `GET /api/sync/road-closures`
- **Purpose**: Retrieve list of active road blockages, washed-out bridges, and hazard corridors.

---

### 4.5. AI Analysis & Chat APIs

#### `POST /api/analyze`
- **Purpose**: Autonomous severity analysis of incident description and photo evidence using Google Gemini Pro Vision API with heuristic fail-safe.
- **Request Body**:
```json
{
  "description": "Flood water entering ground floor electrical substation. Sparks visible.",
  "imageData": "data:image/jpeg;base64,..."
}
```
- **Response Format (200 OK)**:
```json
{
  "success": true,
  "analysis": {
    "category": "flood",
    "severity": "critical",
    "confidenceScore": 0.96,
    "hazardFlags": ["electrocution_risk", "critical_infrastructure", "submerged_equipment"],
    "recommendedAgency": "Fire & Power Utility Emergency Unit",
    "suggestedPriority": "P1",
    "heuristicFallbackUsed": false
  }
}
```

#### `POST /api/chat`
- **Purpose**: Interactive First-Aid & Survival Assistant conversational interface.

---

### 4.6. Two-Factor Authentication & Authority Access

#### `POST /api/auth/send-otp`
- **Purpose**: Send 6-digit cryptographic authentication token to authorized officer email via SMTP.
- **Request Body**: `{ "email": "officer@chronicai.org" }`
- **Response**: `{ "success": true, "message": "Verification code dispatched.", "expiresInSeconds": 900 }`

#### `POST /api/auth/verify-otp`
- **Purpose**: Verify 6-digit token and issue signed session credential.
- **Request Body**: `{ "email": "officer@chronicai.org", "otp": "492815" }`

---

### 4.7. Simulation & Operational Briefing APIs

#### `POST /api/dashboard/seed-ward7`
- **Purpose**: One-click operational simulation seeder. Populates 8 canonical flood breach incidents, 14 response fleet units, active missions, and field telemetry for Kolkata Ward 7 emergency scenario.
- **Response (200 OK)**: `{ "success": true, "message": "Ward 7 scenario seeded." }`

#### `GET /api/dashboard/briefing`
- **Purpose**: Generates high-level EOC SitRep briefing summarizing active casualty counts, unassigned critical incidents, fleet readiness percentage, and weather warnings.

---

## 5. Core Architectural Engines & Subsystems

```text
+-------------------------------------------------------------------------+
|                          CHRONICAI CORE ENGINES                         |
+--------------------+---------------------+------------------------------+
| 1. Gemini AI Engine| 2. Priority Engine  | 3. Haversine Cluster Engine  |
| Visual Damage Eval | Multi-factor (P1-P4)| Spatial & Temporal Proximity |
+--------------------+---------------------+------------------------------+
| 4. Allocation Desk | 5. Delta Sync Engine| 6. Unified Theme Engine      |
| Top-3 Fleet Scoring| Offline Idempotency | System-wide Day/Night Sync   |
+--------------------+---------------------+------------------------------+
```

### 5.1. AI Severity Validation & Heuristic Guardrails
- **Primary Analyzer**: Google Gemini 2.0 / 1.5 Flash Vision. Evaluates uploaded evidence against civil engineering criteria (fissure width, water depth, foundation displacement).
- **Advisory Clamping**: AI output is treated as advisory and clamped within safety guardrails; cannot arbitrarily downgrade life-safety hazards.
- **Heuristic Engine**: When Gemini is unavailable, offline, or rate-limited, an internal deterministic rule engine parses text keywords and metadata to guarantee non-zero analysis.

### 5.2. Multi-Dimensional Priority Engine (P1 - P4)
Calculates integer score $(0 - 100)$ based on weighted factors:
1. **Human Threat Weight (40%)**: Trapped victims $(+25)$, confirmed injured $(+15)$, casualties.
2. **Infrastructure Vulnerability (30%)**: Power substation, bridge, dam embankment, hospital corridor.
3. **Escalation Velocity (20%)**: Rate of flood rise or active fire spread.
4. **Confidence Multiplier (10%)**: Verification by multiple reports or sensor telematics.
- **Tier Mapping**:
  - **P1 (Score 80 - 100)**: Immediate Life Threat / Severe Infrastructure Collapse.
  - **P2 (Score 60 - 79)**: High Urgency / Critical Inundation.
  - **P3 (Score 35 - 59)**: Moderate Civic Hazard / Blocked Arterial Road.
  - **P4 (Score 0 - 34)**: Routine Municipal Repair / Minor Pothole or Leak.

### 5.3. Spatial Haversine Clustering & Duplicate Detection
Calculates great-circle distance between coordinates:
$$d = 2r \arcsin\left(\sqrt{\sin^2\left(\frac{\Delta \phi}{2}\right) + \cos(\phi_1)\cos(\phi_2)\sin^2\left(\frac{\Delta \lambda}{2}\right)}\right)$$
- If distance $d \le 500\text{ meters}$ and time difference $\Delta t \le 24\text{ hours}$ with matching incident category, the system flags the report as a duplicate candidate and links it to the parent canonical incident.

### 5.4. Top-3 Resource Allocation & Dispatch Algorithm
Evaluates candidate assets using a compound scoring formula:
$$\text{Score} = w_1 \cdot \text{CapabilityMatch} + w_2 \cdot \left(1 - \frac{\text{Distance}}{\text{MaxRadius}}\right) + w_3 \cdot \text{ReadinessTier}$$
Top 3 ranked units are returned with estimated time of arrival (ETA) and route hazard warnings.

### 5.5. Universal Theme Synchronization Architecture
- Governed by `theme-manager.js`.
- Maintains synchronous theme states (`data-theme="light"` vs `data-theme="dark"`) across all 15 pages and all dynamic sub-components.
- Features dual-state segmented switchers (`#segDayBtn` / `#segNightBtn`) with automatic cross-tab `localStorage` synchronization and custom event dispatching (`chronic-theme-change`).

---

## 6. Data Models & Persistence Schemas

### 6.1. Incident Entity Schema (`data/incidents.json`)
```typescript
interface CanonicalIncident {
  incidentId: string;                 // Format: INC-YYYY-XXXX
  title: string;                      // Executive summary
  description: string;                // Detailed situation description
  category: "flood" | "infrastructure" | "medical" | "fire" | "landslide";
  priority: "P1" | "P2" | "P3" | "P4";
  priorityScore: number;              // 0 - 100 computed score
  status: "NEW" | "VERIFIED" | "ASSIGNED" | "IN_PROGRESS" | "RESOLVED" | "REJECTED";
  location: {
    latitude: number;
    longitude: number;
    address: string;
    ward?: string;
  };
  casualties: {
    dead: number;
    injured: number;
    trapped: number;
  };
  sourceReportIds: string[];          // Merged citizen report references
  assignedDepartment?: string;
  assignedResources?: string[];       // Dispatched asset IDs
  events: IncidentEvent[];            // Immutable chronological audit trail
  createdAt: number;                  // Epoch timestamp (ms)
  updatedAt: number;
}
```

### 6.2. Mission Entity Schema (`data/missions.json`)
```typescript
interface Mission {
  id: string;                         // Format: MSN-YYYY-XXXX
  incidentId: string;                 // Linked incident
  resourceId: string;                 // Assigned vehicle or team
  assignedTo: string;                 // Field worker / crew lead
  status: "DISPATCHED" | "EN_ROUTE" | "ARRIVED" | "IN_PROGRESS" | "COMPLETED" | "BLOCKED" | "ABORTED";
  etaMinutes: number;
  routeRisk: "LOW" | "MEDIUM" | "HIGH";
  notes: string;
  dispatchedAt: number;
  completedAt?: number;
}
```

---

## 7. Deployment, Clustered HA Supervisor & DevOps

### 7.1. Clustered High-Availability Supervisor (`server/server.js`)
- Employs Node.js `cluster` module with round-robin scheduling (`SCHED_RR`).
- Primary supervisor forks and monitors 2 identical worker processes.
- **Self-Healing Watchdog**: Periodic heartbeat checks (`HA_HEARTBEAT_MS`) detect stalled or crashed workers, automatically recycling memory and restarting processes without downtime.
- **Dynamic Port Resolver**: Probes ports starting at `$PORT` (default `3000`) up to 25 candidate ports to prevent `EADDRINUSE` conflicts.

### 7.2. Production Edge Hosting (Vercel)
- **Deployment URL**: [https://chronicai-kappa.vercel.app](https://chronicai-kappa.vercel.app)
- Clean URL routing configured in `vercel.json`:
  - `/` → `/public/html/index.html`
  - `/login` → `/public/html/login.html`
  - `/register` → `/public/html/register.html`
  - `/:page` → `/public/html/:page.html`
  - Asset directories (`/css/`, `/js/`, `/images/`, `/icons/`) routed directly with long-term caching.

---

## 8. Environment Variables & Configuration Guide

| Variable Name | Purpose & Usage | Default / Fallback |
|:---|:---|:---|
| `PORT` | Primary network port for Express web server. | `3000` |
| `GEMINI_API_KEY` | Google Gemini AI Vision API key for multimodal damage triage. | Required for live AI |
| `EMAIL_USER` | SMTP username / address for outbound 2FA OTP codes. | System default |
| `EMAIL_PASS` | SMTP application-specific password. | System default |
| `SMTP_HOST` | Hostname for SMTP email server (e.g. `smtp.gmail.com`). | `smtp.gmail.com` |
| `SMTP_PORT` | Port for SMTP server (typically `465` SSL or `587` TLS). | `587` |
| `HA_WORKERS` | Number of worker processes supervised by cluster manager. | `2` |
| `HA_HEARTBEAT_MS` | Interval between worker process health probes. | `2000` |
| `HA_MAX_RSS_MB` | Maximum memory footprint before worker recycling. | `768` |
| `CHRONICAI_ENV` | Runtime environment mode (`production` / `development`). | `development` |

---
*ChronicAI Enterprise Systems — Official Documentation & Architecture Reference.*
