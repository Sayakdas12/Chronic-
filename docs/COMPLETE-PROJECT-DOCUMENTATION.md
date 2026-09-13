# ChronicAI
## Complete Project Documentation

**Project type:** AI-assisted civic and disaster response platform  
**Runtime:** Node.js, Express, Firebase, browser JavaScript  
**Primary audience:** Citizens, government officers, emergency coordinators, and field responders  
**Primary category:** Student Innovation - Disaster Management

---

## 1. Executive Summary

ChronicAI connects citizens with government and emergency-response teams through a unified civic and disaster-management platform. It collects citizen reports, location signals, emergency requests, risk information, missing-person reports, resource data, and field updates in one operational workflow.

The central response lifecycle is:

```text
Report -> Normalize -> Analyze -> Verify -> Prioritize -> Recommend -> Dispatch -> Track -> Resolve -> Learn
```

The platform supports two related situations:

- **Before a disaster:** risk monitoring, early warnings, preparedness actions, safe resources, and evacuation planning.
- **During or after a disaster:** incident reporting, SOS alerts, emergency assistance, resource dispatch, rescue tracking, missing-person coordination, and field synchronization.

AI is used as an advisory and triage layer. Critical decisions remain subject to human verification and authority controls.

---

## 2. Problem Statement

During disasters, information is fragmented across phone calls, social media, spreadsheets, local departments, and disconnected public services. This creates several problems:

- Citizens do not know which information is verified.
- Authorities receive duplicate or incomplete reports.
- Emergency priorities are difficult to compare.
- Available rescue resources are not matched quickly to incidents.
- Field workers lose updates in low-connectivity areas.
- Citizens cannot easily see whether help has been received or dispatched.
- Location, shelter, route, and hazard information is spread across separate tools.

ChronicAI addresses this by providing a shared response layer between citizens, field teams, and government command centers.

---

## 3. Objectives

1. Provide citizens with fast, understandable disaster information.
2. Reduce the time required to report and triage hazards.
3. Convert raw reports into structured operational incidents.
4. Detect duplicate reports and preserve source evidence.
5. Rank incidents using deterministic priority rules and AI recommendations.
6. Recommend nearby and capable response resources.
7. Provide an SOS flow using previously captured citizen location.
8. Keep field updates available during temporary network loss.
9. Give authorities a live incident, resource, map, and SOS command view.
10. Preserve audit information for important state changes.

---

## 4. Users and Roles

### 4.1 Citizen

Citizens can:

- Register and sign in.
- Share a location for nearby information.
- View live disaster updates and risk conditions.
- Report civic or disaster incidents.
- Request assistance.
- Send an SOS with saved coordinates and a help message.
- Find resources, shelters, hospitals, and emergency services.
- Track a submitted report.
- Report or search for missing persons.
- Ask the AI Life Helper for preparedness and emergency guidance.
- Submit support, donation, or volunteer information.

### 4.2 Government Officer

Authorized officers can:

- View the incident queue.
- Review AI analysis and urgency signals.
- Verify, reject, or merge incidents.
- View live SOS alerts and locations.
- Recommend and dispatch resources.
- Monitor district situation reports.
- Update report status.
- Review support and volunteer requests.
- Inspect map signals and operational metrics.

### 4.3 Field Worker

Field workers can use the offline synchronization layer to:

- Receive assigned missions.
- Update mission status.
- Record rescue counts and field notes.
- Report road closures.
- Queue updates in IndexedDB when disconnected.
- Synchronize queued operations after reconnecting.

### 4.4 Supervisor or Administrator

Supervisors manage authority access, operational review, role-based actions, resource allocation, and audit visibility.

---

## 5. Main Product Modules

### 5.1 Public Homepage

File: `public/html/index.html`

Provides:

- Live disaster feed.
- Disaster radar and map layers.
- Location capture and nearby resource information.
- Risk and weather signals.
- Incident reporting entry point.
- Emergency assistance entry point.
- SOS button.
- Authority portal entry point.
- Government branding and civic navigation.

### 5.2 Risk Watch

File: `public/html/risk-dashboard.html`

Provides:

- Overall risk score.
- Environmental conditions.
- Forecast signals.
- Preparedness actions.
- Nearby situation map.
- Historical signals.
- Monitored locations.
- Preparedness checklist.

Risk information is informational and must not replace official evacuation orders.

### 5.3 Incident Reporting

Files: `public/html/report-problem.html`, `public/js/report-problem.js`

Flow:

1. Citizen describes the issue.
2. Citizen can attach evidence.
3. Citizen shares or enters location.
4. AI analyzes category, severity, hazards, urgency, and recommendations.
5. Citizen reviews the result.
6. Report is submitted.
7. Authority can verify, prioritize, assign, and track it.

### 5.4 Emergency Assistance Request

Files: `public/html/request.html`, `public/js/request.js`

Supports help categories including flood, medical, rescue, fire, food/water, road blockage, shelter, and other needs. It includes review-before-send behavior and can create an emergency request associated with a report.

### 5.5 SOS System

Files: `public/js/sos.js`, `server/firebase.js`

SOS behavior:

1. User must be signed in.
2. The user enters or confirms a short help message.
3. SOS reads the previously captured location from `chronicAILocation`.
4. Latitude and longitude are validated.
5. The location is not fetched again during the SOS click.
6. The request is authenticated with Firebase when available.
7. A local demo mode is supported only on localhost.
8. The alert is written to `sosAlerts/{sosId}`.
9. Email is sent through the configured provider.
10. The record is updated with `NOTIFIED` or `NOTIFICATION_FAILED`.
11. If the network is unavailable, the alert is stored in a local queue and retried after reconnecting.

The email includes:

- SOS ID.
- User ID.
- Alert time.
- Location capture time.
- Location accuracy when available.
- Latitude and longitude.
- Google Maps link.
- Citizen help message.

The SOS feature is not a replacement for calling local emergency services.

### 5.6 Resource Center

File: `public/html/resource-center.html`

Provides nearby resources such as shelters, hospitals, police, rescue teams, relief points, and emergency facilities. It uses location and distance calculations to help citizens find nearby support.

### 5.7 Safe Journey and Routing

The intended journey module is represented by `journey.js`, `emergency-map.js`, and journey CSS. It is intended to compare routes using distance, travel time, and hazard proximity.

**Current implementation note:** The audit found that `journey.html` is not currently present in the active public HTML directory. This route must be restored before presenting Safe Journey as a complete production capability.

### 5.8 AI Life Helper

File: `public/html/life-helper.html`

Provides:

- Flood, fire, earthquake, injury, rescue, and preparedness shortcuts.
- Text-based emergency guidance.
- Voice input capability.
- Image and conversational assistance.

AI guidance is advisory. Citizens must follow verified government instructions.

### 5.9 Missing Persons

Files: `public/html/missing-persons.html`, `public/js/missing-persons.js`

Supports reporting, searching, viewing, and sharing information about missing people. Firebase rules distinguish public information from protected reporter and administrative information.

### 5.10 Rescue Tracking

Files: `public/html/track.html`, `public/js/rescue-tracking.js`

Provides live rescue vehicle and mission information, location-aware tracking, agency contact actions, and route visualization where live data is available.

### 5.11 Government Operations Dashboard

Files: `public/html/admin-dashboard.html`, `public/js/admin-dashboard.js`

Provides:

- District AI situation briefing.
- P1-P4 canonical incident queue.
- Critical alerts.
- SOS alerts and map signals.
- SOS volume and active SOS metrics.
- SOS notification rate.
- Average SOS notification response time.
- Raw citizen report control.
- Incident verification and duplicate review.
- Top-3 resource recommendation and dispatch.
- Missing-person records.
- Support and volunteer request review.
- Operational map.
- Theme-aware responsive command-center UI.

---

## 6. Architecture

```text
Browser pages
    |
    | HTTPS/JSON and Firebase client authentication
    v
Express application (server/firebase.js)
    |
    +-- Firebase Admin Auth
    +-- Firebase Realtime Database
    +-- Firebase Storage integrations
    +-- AI analysis and briefing services
    +-- Email provider service
    +-- Incident and mission domain services
    +-- Offline sync API
    |
    v
Government dashboard and field-worker workflows
```

### 6.1 Runtime Entry Point

`server/server.js` starts the application supervisor and workers. It selects an available port and starts the Express application.

Typical local command:

```text
cd Chronic-
npm start
```

The default port is `3000`, but the app may select another available port. In recent local testing it ran on port `3004`.

### 6.2 Static Frontend

Express serves `public/` as static content. HTML files live in `public/html/`, while the server preserves root-style page URLs such as `/index.html`.

### 6.3 Domain Services

Important server service areas include:

- Incident lifecycle and event history.
- Priority and SLA calculation.
- AI validation and heuristic fallback.
- Duplicate detection and merging.
- Resource recommendation.
- Mission creation and dispatch.
- Offline synchronization and idempotency.
- District briefing generation.
- Disaster feed aggregation.
- Email delivery.

---

## 7. Data and Lifecycle Model

### 7.1 Core Entities

- `User`
- `Report`
- `Incident`
- `Mission`
- `Resource`
- `Shelter`
- `Alert`
- `IncidentEvent`
- `SyncOperation`
- `SOSAlert`

### 7.2 Incident Lifecycle

```text
REPORTED
  -> AI_ANALYZED
  -> NEEDS_VERIFICATION
  -> VERIFIED
  -> PRIORITIZED
  -> RESOURCE_RECOMMENDED
  -> ASSIGNED
  -> IN_PROGRESS
  -> RESOLVED
```

Alternative states include `DUPLICATE`, `REJECTED`, `ESCALATED`, `UNASSIGNED`, and `BLOCKED`.

Important lifecycle changes should create immutable timeline events.

### 7.3 SOS Lifecycle

```text
PENDING_NOTIFICATION
  -> NOTIFIED

PENDING_NOTIFICATION
  -> NOTIFICATION_FAILED
```

The current SOS lifecycle records notification status. A future responder lifecycle should add `ACKNOWLEDGED`, `DISPATCHED`, `ARRIVED`, and `RESOLVED`.

---

## 8. AI Decision Boundary

AI may provide:

- Incident category.
- Severity recommendation.
- Confidence.
- Urgency signals.
- Hazard extraction.
- Suggested department.
- Suggested resources.
- Structured explanations.
- Situation report language.

AI must not independently:

- Dispatch an emergency resource.
- Close a critical incident.
- Reject a critical incident.
- Override a government officer.
- Issue an official evacuation order.

Human verification is required for high-risk incidents. Deterministic fallback logic keeps core triage and briefing behavior available when AI is unavailable, timed out, or over quota.

---

## 9. Location and Map Design

Location-dependent features include:

- Homepage nearby resources.
- Homepage risk signals.
- SOS saved coordinates.
- Resource Center distance sorting.
- Risk Watch location monitoring.
- Missing-person location capture.
- Rescue tracking.
- Emergency route comparison.
- Government dashboard map signals.

Location data should be:

- Validated for latitude and longitude range.
- Timestamped.
- Associated with accuracy where available.
- Clearly labelled as current, saved, estimated, or unavailable.
- Used only for the purpose disclosed to the citizen.

External providers may include OpenStreetMap, Nominatim, OSRM, Open-Meteo, USGS, GDACS, and Leaflet. Provider failure must show a clear fallback state.

---

## 10. Offline and Low-Connectivity Design

### 10.1 PWA Layer

The platform includes:

- `public/assets/manifest.json`
- `public/assets/service-worker.js`
- `public/js/offline-app.js`

The service worker caches the application shell, critical pages, scripts, styles, images, and manifest. Navigations fall back to cached pages or the cached homepage when the network is unavailable.

### 10.2 Field-Worker Offline Sync

`public/js/field-offline-sync.js` uses IndexedDB to store:

- Incidents.
- Missions.
- Resources.
- Road closures.
- Pending synchronization operations.

Operations are idempotent and include retry counts. Reconnection triggers push and pull synchronization.

### 10.3 Civilian SOS Offline Queue

When SOS delivery cannot reach the server, the payload is stored locally in `chronicAISosQueue`. It is retried when the browser reports that the network is online.

This is a best-effort browser queue. It is not equivalent to a telecom-grade emergency dispatch channel, and the user should still call emergency services when necessary.

---

## 11. Security and Privacy

### 11.1 Authentication

Firebase Authentication is used for citizen and government identities. Protected server routes verify Firebase ID tokens.

### 11.2 Authorization

Firebase Realtime Database rules are deny-by-default. Role-sensitive writes are limited to trusted roles such as:

- `admin`
- `super_admin`
- `government_officer`
- `rescue_coordinator`

The server must remain the authority for critical writes and role checks.

### 11.3 Secrets

Secrets must remain outside `public/`:

- Firebase Admin service credentials.
- Gmail or SMTP credentials.
- AI API keys.
- OTP hashing secrets.
- Email provider keys.

Use `Chronic-/.env` locally and deployment environment variables in production. Never commit `.env`.

### 11.4 Sensitive Location Data

SOS coordinates and missing-person information are sensitive. Production deployment should define retention periods, access logging, incident visibility rules, and user consent language.

### 11.5 Local Development Bypass

Local demo authentication and local admin bypass exist for development testing only. They must be disabled or strictly constrained in production.

---

## 12. Email Configuration

The email service supports Resend, Brevo, and SMTP/Gmail fallback.

Example local configuration:

```env
ADMIN_NOTIFICATION_EMAIL=authority@example.com
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=sender@example.com
SMTP_PASSWORD=google-app-password
```

Use a Google App Password rather than a normal Gmail password. The receiving address and sender credentials are different concerns and should be configured intentionally.

Email delivery failure must not be shown as successful. The SOS record should remain auditable as `NOTIFICATION_FAILED`.

---

## 13. API Surface

Representative endpoints include:

```text
GET  /health
GET  /api/health
GET  /api/disasters/india
GET  /api/resources
GET  /api/reports
POST /api/reports
POST /api/analyze
POST /api/emergency-requests
POST /api/sos
GET  /api/risk
GET  /api/dashboard/briefing
GET  /api/admin/overview
POST /api/dashboard/seed-ward7
POST /api/sync/push
GET  /api/sync/pull
GET  /api/sync/road-closures
POST /api/auth/send-otp
POST /api/auth/verify-otp
```

Protected routes must reject missing or invalid authorization. In local testing, unauthenticated emergency and SOS requests returned `401`.

---

## 14. Government Dashboard Metrics

The command dashboard exposes:

- Total reports.
- Active emergencies.
- Critical cases.
- People needing help.
- Missing persons.
- Trapped or stranded people.
- Resource requests.
- Damaged assets.
- Resolved cases.
- SOS alerts.
- Active SOS alerts.
- SOS notification rate.
- Average SOS notification response time.
- Fleet availability.
- Road blockages.

SOS response time currently measures alert creation to email notification timestamp. It does not yet measure human acknowledgement, dispatch, arrival, or rescue completion.

---

## 15. Testing Strategy

Run the project tests from the application root:

```text
npm test -- --test-reporter=spec
```

Test areas include:

- Incident lifecycle transitions.
- Priority scoring.
- AI validation and fallback behavior.
- Resource allocation.
- Mission dispatch.
- Duplicate detection and merge safety.
- API report behavior.
- Offline sync validation.
- Idempotent operation replay.
- Road closure synchronization.
- Dashboard scenario seeding.

Additional manual test matrix:

| Area | Required checks |
|---|---|
| Mobile | 320px, 375px, 390px layouts, touch controls, keyboard, SOS |
| Tablet | Navigation, maps, forms, dashboard scaling |
| Desktop | Tables, dashboard, maps, modals, authority workflows |
| Location | Granted, denied, unavailable, stale saved location |
| Network | Slow, disconnected, reconnect, API timeout |
| SOS | Stored location, no second GPS request, auth, queue, email failure |
| Accessibility | Keyboard focus, labels, contrast, screen reader semantics |
| Security | Anonymous API rejection, role enforcement, secret isolation |

---

## 16. Current Limitations

The following limitations should be stated honestly during a demo:

- Safe Journey page must be restored before claiming complete evacuation routing.
- Life Helper currently has a known voice initialization error that needs repair.
- External maps and live feeds require network availability.
- Gmail/email delivery requires correctly configured server environment variables.
- Offline SOS is queued locally but cannot guarantee immediate delivery without connectivity.
- AI providers may timeout or exceed quota; deterministic fallback is used.
- Government scenario data is demonstration data unless connected to an authoritative deployment.
- The current SOS metric measures notification delivery, not responder arrival.
- A real deployment needs telecom, authority, retention, privacy, and disaster-operations agreements.

---

## 17. Recommended Production Roadmap

### Priority 0 - Safety blockers

1. Restore and test Safe Journey.
2. Fix Life Helper voice initialization.
3. Add SMS or voice fallback for SOS.
4. Add responder acknowledgement and civilian status timeline.
5. Validate all critical emergency actions under offline conditions.

### Priority 1 - Operational reliability

1. Add server-side durable SOS retry processing.
2. Add monitoring and alerting for email provider failure.
3. Add provider health status to the authority dashboard.
4. Add verified authority data labels and timestamps.
5. Add disaster-specific offline content packs.

### Priority 2 - Accessibility and reach

1. Add Bengali, Hindi, and other local languages.
2. Add stronger screen-reader and keyboard support.
3. Test low-end Android devices and 2G/3G conditions.
4. Reduce image and map payloads for low bandwidth.
5. Add simple phone-call access for users without smartphones.

### Priority 3 - Evidence and scale

1. Pilot with a ward or municipal partner.
2. Measure report-to-verification time.
3. Measure verification-to-dispatch time.
4. Measure notification-to-acknowledgement time.
5. Measure evacuation and rescue outcomes.
6. Perform load, security, privacy, and disaster-recovery testing.

---

## 18. SIH Demonstration Script

A strong five-minute demonstration should follow this order:

1. Introduce a Ward 7 flood scenario.
2. Show the citizen risk and live disaster view.
3. Capture or display the citizen's saved location.
4. Send an SOS with the message `I need urgent help.`
5. Show the authority alert, map marker, and SOS reference.
6. Show P1/P2 incident prioritization.
7. Open duplicate detection and explain evidence preservation.
8. Open Top-3 Fleet recommendations.
9. Dispatch a suitable resource.
10. Switch to the government dashboard and show response metrics.
11. Demonstrate field offline queueing and reconnect synchronization.
12. Explain AI advisory boundaries and human verification.
13. End with measurable impact targets rather than unsupported claims.

---

## 19. Impact Metrics

The project should report measurable targets such as:

- Reduction in report triage time.
- Reduction in duplicate incident handling.
- Time from verified P1 incident to resource recommendation.
- Time from SOS creation to authority notification.
- Percentage of offline field operations synchronized successfully.
- Percentage of reports with usable coordinates.
- Percentage of incidents with complete audit trails.
- Number of citizens reached with preparedness information.

A future pilot should compare these measurements against the existing manual process.

---

## 20. Final Project Positioning

ChronicAI is best presented as an AI-assisted civic and disaster-response coordination platform, not as a replacement for official emergency services. Its strongest contribution is the connection between citizen signals, structured incident intelligence, authority verification, resource dispatch, location awareness, and field synchronization.

The prototype demonstrates a credible end-to-end direction. To become dependable for real civilian safety, it must complete evacuation routing, repair voice assistance, add telecom-grade SOS fallback, clarify verified information, and validate outcomes through a real field pilot.

**Core message:**

> ChronicAI helps turn scattered citizen signals into verified, prioritized, and trackable disaster-response action.
