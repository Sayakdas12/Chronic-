# ChronicAI Response Network

## 1) Product Definition
ChronicAI is an AI-assisted civic and disaster response operating system.

It converts fragmented reports into verified, prioritized, and trackable field actions:

Report -> Normalize -> Analyze -> Deduplicate -> Verify -> Prioritize -> Allocate -> Dispatch -> Track -> Resolve -> Learn

This unifies two existing product directions in the codebase:
- civic complaint and SLA management
- emergency response and field coordination

## 2) Current State Analysis
The current project already has strong feature modules:
- citizen reporting
- emergency requests
- map views and risk views
- safe journey routing
- missing-person registry
- resource center
- support requests
- government dashboard and status updates

Main gaps found:
- report persistence still partly relies on local JSON behavior
- incident and report terminology are mixed
- AI recommendation and operational decision boundaries are not explicit enough
- civic SLA and emergency response timing are not clearly separated
- offline flow for field workers is not yet a first-class workflow

## 3) Frontend Architecture

### 3.1 Frontend Apps and Pages
Primary UI pages are under [public/html/index.html](public/html/index.html) and related page entries:
- [public/html/report-problem.html](public/html/report-problem.html)
- [public/html/request.html](public/html/request.html)
- [public/html/track.html](public/html/track.html)
- [public/html/journey.html](public/html/journey.html)
- [public/html/resource-center.html](public/html/resource-center.html)
- [public/html/risk-dashboard.html](public/html/risk-dashboard.html)
- [public/html/missing-persons.html](public/html/missing-persons.html)
- [public/html/life-helper.html](public/html/life-helper.html)
- [public/html/admin-login.html](public/html/admin-login.html)
- [public/html/admin-dashboard.html](public/html/admin-dashboard.html)

Client scripts are under [public/js](public/js) and styles under [public/css](public/css).

### 3.2 Frontend Role Views
Citizen:
- submit civic report
- submit SOS request
- view safe journey
- search resources
- report and search missing persons

Government Officer:
- review queue
- verify incident
- update status
- assign and escalate

Field Worker target flow (to be completed):
- receive mission list
- update mission in low connectivity
- sync queued updates when online

### 3.3 Frontend Data Interaction Model
- static pages served via Vercel CDN
- API calls proxied from Vercel to backend service
- Firebase web auth used for user identity in protected flows
- map and routing APIs used for geospatial context

### 3.4 Frontend Non-Functional Requirements
- mobile-first usability for disaster conditions
- low-bandwidth resilience
- visible retry states
- clear separation of public and protected views

## 4) Backend Architecture

### 4.1 Runtime and Entry
- supervisor process in [server/server.js](server/server.js)
- API application in [server/firebase.js](server/firebase.js)
- email provider failover in [server/email-service.js](server/email-service.js)
- OTP challenge and verification in [server/otp-service.js](server/otp-service.js)

### 4.2 Backend Service Boundaries
Target modular boundaries:
- auth
- incidents
- reports
- AI analysis
- priority scoring
- deduplication
- resources and missions
- sync
- notifications
- audit

### 4.3 Persistence Strategy
Authoritative storage target:
- Firebase Realtime Database for operational state
- Firebase Auth for identity and role enforcement
- Firebase Storage for media files

Current improvement completed:
- report read and write path has been refactored to Firebase-primary with local fallback inside [server/firebase.js](server/firebase.js)

### 4.4 Security Model
Required controls:
- verify Firebase ID tokens on protected routes
- role-based authorization for write operations
- rate limit on anonymous and OTP routes
- strict payload validation and file-size limits
- never expose secrets or private victim data via public endpoints

### 4.5 AI Decision Boundary
AI is advisory, not autonomous authority.

AI can provide:
- category
- severity recommendation
- confidence
- structured explanation
- suggested resources

AI cannot directly:
- dispatch emergency resource
- close critical incident
- reject critical incident

Human verification is mandatory for P1 and P2 incidents.

## 5) Canonical Domain Model

Core entities:
- Report
- Incident
- Mission
- Resource
- Shelter
- Alert
- IncidentEvent
- SyncOperation
- User

Terminology policy:
- Report: raw submission
- Incident: normalized operational case
- Mission: assignment to worker and resource
- Event: immutable audit timeline record

## 6) Unified Incident Lifecycle
REPORTED
-> AI_ANALYZED
-> NEEDS_VERIFICATION
-> VERIFIED
-> PRIORITIZED
-> RESOURCE_RECOMMENDED
-> ASSIGNED
-> IN_PROGRESS
-> RESOLVED

Alternative routes:
- NEEDS_VERIFICATION -> REJECTED
- REPORTED -> DUPLICATE
- VERIFIED -> ESCALATED
- ASSIGNED -> UNASSIGNED
- IN_PROGRESS -> BLOCKED

Every state change must emit an immutable event record.

## 7) Use Cases by Role

### 7.1 Citizen Use Cases
- submit civic issue with text, image, and location
- submit emergency SOS with location
- track status timeline of submitted report
- find nearby resource points and shelters
- report missing person and search active registry

### 7.2 Government Officer Use Cases
- review incoming incidents
- inspect AI recommendation and evidence
- verify, reject, merge duplicates
- apply priority and override with reason
- assign resources and missions
- monitor SLA and escalations

### 7.3 Field Worker Use Cases
- load assigned missions
- perform updates offline
- attach notes and evidence
- mark arrival, rescue, blockages, completion
- synchronize queued operations on reconnect

### 7.4 Supervisor Use Cases
- district overview
- cross-queue prioritization
- resource reallocation
- audit review and performance tracking

## 8) Priority and SLA Design

Two timing systems must stay separate.

Emergency Response Targets:
- acknowledge
- assign
- dispatch and arrival

Civic Resolution SLA:
- acknowledge
- begin work
- resolve issue

Priority scoring model combines:
- AI recommendation
- deterministic rule score
- vulnerability adjustments
- officer override with reason

## 9) Duplicate Detection Design
Three-stage detection:
- stage 1: spatial and temporal candidates
- stage 2: text and category similarity
- stage 3: human merge confirmation

Rules:
- do not delete original reports
- keep canonical incident linked to all source reports
- store merge action as immutable event

## 10) Resource Allocation Design
Top-three recommendation model based on:
- capability match
- availability
- capacity
- travel time
- route risk
- workload

Assignment is officer-approved, never AI-autonomous.

## 11) Offline-First Field Operations
Use IndexedDB with Dexie for durable local queues on field devices.

Local stores:
- incidents
- missions
- resources
- syncQueue
- attachments
- conflicts

Sync rules:
- generate operation id per mutation
- idempotent server apply
- exponential backoff retry
- preserve rejected operations and show conflict UI

## 12) API Surface Plan
Current routes exist in [server/firebase.js](server/firebase.js). The planned normalized surface is:
- POST /api/reports
- GET /api/reports
- GET /api/reports/:id
- PATCH /api/reports/:id/status
- POST /api/reports/:id/escalate
- GET /api/reports/:id/timeline

Incident and operations expansion:
- POST /api/incidents/:id/verify
- POST /api/incidents/:id/merge
- POST /api/incidents/:id/assign
- POST /api/incidents/:id/resolve
- POST /api/sync/push
- GET /api/sync/pull

Mutating operations should support an idempotency key.

## 13) Deployment Architecture
Frontend:
- Vercel static hosting and route rewrites in [vercel.json](vercel.json)

Backend:
- long-running Node service (Render preferred in current account state)
- deployment blueprint in [render.yaml](render.yaml)

Configuration:
- examples in [.env.example](.env.example)
- real secrets must remain in provider env settings, not committed files

## 14) Testing and Validation Plan
Minimum automated coverage:
- priority score unit tests
- duplicate candidate ranking tests
- resource allocation tests
- AI response schema validation tests
- role authorization tests
- sync idempotency tests

Manual validation:
- offline mission update and reconnect sync
- report-to-resolution end-to-end walkthrough
- public map privacy checks

## 15) Build Order
1. canonical types and enums
2. normalized report and incident persistence
3. AI structured output validation and fallback
4. deterministic priority engine
5. duplicate detection and merge flow
6. resource recommendation and assignment
7. offline sync queue and idempotent endpoints
8. dashboard incident detail and briefing
9. SLA escalation and notification hardening
10. test pack and demo script

## 16) Demo Scenario (Hackathon)
District scenario example:
- multiple reports for same flood location
- merge into one canonical incident
- AI and deterministic score mark as P1
- officer verifies and assigns best resource
- worker updates while offline
- sync on reconnect updates timeline and dashboard

## 17) Frontend vs Backend Responsibility Matrix

Frontend responsibilities:
- user interaction and form workflows
- map rendering and local state
- offline queue capture for field operations
- display AI explanations, priorities, and timelines

Backend responsibilities:
- trust boundary and auth validation
- AI orchestration and rule scoring
- canonical incident state management
- merge, assignment, escalation, and audit events
- idempotent synchronization and notification fallback

## 18) Known Limitations and Current Constraints
- Railway deployment is blocked by account trial expiry in this environment
- backend deployment target should be Render unless Railway plan is re-enabled
- full field-worker offline module is planned but not fully implemented yet
- authoritative report storage should continue moving away from filesystem-only behavior

## 19) Immediate Next Implementation Slice
Vertical slice to complete next:
- report create
- AI analysis
- duplicate candidate suggestion
- officer verification
- priority scoring
- resource recommendation
- assignment
- timeline event emission

This slice should be completed end-to-end before expanding to optional modules.
