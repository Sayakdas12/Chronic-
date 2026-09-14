import os
import docx
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

def set_cell_background(cell, fill_hex):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), fill_hex)
    tcPr.append(shd)

def set_cell_margins(cell, top=100, bottom=100, left=150, right=150):
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = OxmlElement('w:tcMar')
    for m_name, m_val in [('top', top), ('bottom', bottom), ('left', left), ('right', right)]:
        node = OxmlElement(f'w:{m_name}')
        node.set(qn('w:w'), str(m_val))
        node.set(qn('w:type'), 'dxa')
        tcMar.append(node)
    tcPr.append(tcMar)

def add_callout(doc, text, title="CRITICAL ARCHITECTURAL NOTE"):
    table = doc.add_table(rows=1, cols=1)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    
    cell = table.cell(0, 0)
    cell.width = Inches(6.5)
    set_cell_background(cell, "F0F9FF")
    set_cell_margins(cell, top=140, bottom=140, left=200, right=200)
    
    p = cell.paragraphs[0]
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(2)
    p.paragraph_format.line_spacing = 1.15
    
    run_t = p.add_run(f"[{title}]\n")
    run_t.font.name = "Segoe UI"
    run_t.font.size = Pt(9.5)
    run_t.font.bold = True
    run_t.font.color.rgb = RGBColor(2, 132, 199)
    
    run_b = p.add_run(text)
    run_b.font.name = "Segoe UI"
    run_b.font.size = Pt(9.5)
    run_b.font.color.rgb = RGBColor(15, 23, 42)
    
    # Left border styling in XML
    tcPr = cell._tc.get_or_add_tcPr()
    tcBorders = OxmlElement('w:tcBorders')
    
    left = OxmlElement('w:left')
    left.set(qn('w:val'), 'single')
    left.set(qn('w:sz'), '24') # 3pt
    left.set(qn('w:space'), '0')
    left.set(qn('w:color'), '0284C7')
    tcBorders.append(left)
    
    for side in ['top', 'bottom', 'right']:
        edge = OxmlElement(f'w:{side}')
        edge.set(qn('w:val'), 'none')
        tcBorders.append(edge)
        
    tcPr.append(tcBorders)
    doc.add_paragraph().paragraph_format.space_after = Pt(6)

def style_table_header(row, col_widths, bg_hex="0A2540"):
    for idx, cell in enumerate(row.cells):
        cell.width = col_widths[idx]
        set_cell_background(cell, bg_hex)
        set_cell_margins(cell, top=120, bottom=120, left=140, right=140)
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        for run in p.runs:
            run.font.name = "Segoe UI"
            run.font.size = Pt(9.5)
            run.font.bold = True
            run.font.color.rgb = RGBColor(255, 255, 255)

def style_table_row(row, col_widths, bg_hex="FFFFFF"):
    for idx, cell in enumerate(row.cells):
        cell.width = col_widths[idx]
        set_cell_background(cell, bg_hex)
        set_cell_margins(cell, top=100, bottom=100, left=140, right=140)
        p = cell.paragraphs[0]
        for run in p.runs:
            run.font.name = "Segoe UI"
            run.font.size = Pt(9)
            run.font.color.rgb = RGBColor(30, 41, 59)

def main():
    doc = Document()
    
    # Page Margins (1 inch everywhere)
    for section in doc.sections:
        section.top_margin = Inches(1.0)
        section.bottom_margin = Inches(1.0)
        section.left_margin = Inches(1.0)
        section.right_margin = Inches(1.0)

    # -------------------------------------------------------------
    # COVER / HEADER
    # -------------------------------------------------------------
    title_p = doc.add_paragraph()
    title_p.paragraph_format.space_before = Pt(24)
    title_p.paragraph_format.space_after = Pt(4)
    run_brand = title_p.add_run("CHRONICAI PLATFORM SPECIFICATION\n")
    run_brand.font.name = "Segoe UI"
    run_brand.font.size = Pt(26)
    run_brand.font.bold = True
    run_brand.font.color.rgb = RGBColor(9, 26, 45) # Deep navy

    run_sub = title_p.add_run("Autonomous Civic Triage, Disaster Incident Management & Emergency Response Network")
    run_sub.font.name = "Segoe UI"
    run_sub.font.size = Pt(13)
    run_sub.font.color.rgb = RGBColor(2, 132, 199)

    meta_p = doc.add_paragraph()
    meta_p.paragraph_format.space_before = Pt(8)
    meta_p.paragraph_format.space_after = Pt(24)
    r_meta = meta_p.add_run("Version: 2.4.0-Production  |  Environment: Production Vercel & Node HA Cluster  |  Published: September 2026")
    r_meta.font.name = "Segoe UI"
    r_meta.font.size = Pt(9.5)
    r_meta.font.italic = True
    r_meta.font.color.rgb = RGBColor(100, 116, 139)

    doc.add_heading("1. Executive Summary & Problem Scope", level=1)
    
    p = doc.add_paragraph()
    p.paragraph_format.line_spacing = 1.2
    p.paragraph_format.space_after = Pt(8)
    p.add_run(
        "ChronicAI is an enterprise-grade autonomous municipal triage and disaster incident response network designed to bridge "
        "the operational gap between citizens on the ground, field response personnel, and district emergency operations centers (EOC). "
        "During natural disasters such as flash floods, structural breaches, or severe meteorological events, municipal communication "
        "often collapses under duplicated citizen filings, delayed severity triage, and blind dispatching of emergency assets."
    )
    
    add_callout(
        doc,
        "ChronicAI incorporates real-time multimodal Gemini Vision AI analysis, spatial Haversine duplicate clustering, "
        "an algorithmic Top-3 resource allocation engine, and idempotent offline field delta sync to guarantee zero data loss "
        "and rapid life-safety intervention under all connectivity conditions.",
        title="CORE SYSTEM VALUE PROPOSITION"
    )

    # -------------------------------------------------------------
    # 2. PLAIN-ENGLISH WORKFLOW & USER ROLES
    # -------------------------------------------------------------
    doc.add_heading("2. Plain-English Guide & Application Workflow", level=1)
    
    p = doc.add_paragraph()
    p.paragraph_format.line_spacing = 1.15
    p.add_run(
        "In simple terms, ChronicAI is an intelligent emergency management network—similar to 911 combined with Uber and AI. "
        "When an embankment collapses, a road washes out, or floodwaters trap citizens, ChronicAI connects the person on the ground "
        "directly to the emergency director's screen and dispatches the closest rescue squad automatically.\n"
    )
    
    # The 4 Roles Table
    doc.add_heading("2.1 The 4 Key User Roles", level=2)
    roles_data = [
        ("1. Everyday Citizen", "report-problem.html, track.html, request.html", "Takes photos of hazards, tags GPS coordinates, requests emergency boat/water aid, and tracks resolution."),
        ("2. Emergency Officer", "admin-login.html, admin-dashboard.html", "Logs in with 2FA email OTP, verifies incident urgency, reviews AI severity, and dispatches rescue assets."),
        ("3. Field Responders", "Mobile Web App, Offline Sync Queue", "Ambulance, NDRF boat, or engineering squads who receive missions, update status, and operate even with zero cell service."),
        ("4. Donors & Volunteers", "support.html, resource-center.html, missing-persons.html", "Citizens and NGOs who donate funds/supplies, locate relief shelters, or search for displaced family.")
    ]
    
    tbl_roles = doc.add_table(rows=len(roles_data) + 1, cols=3)
    tbl_roles.alignment = WD_TABLE_ALIGNMENT.CENTER
    col_w_roles = [Inches(1.5), Inches(2.0), Inches(3.0)]
    
    hdr_r = tbl_roles.rows[0]
    hdr_r.cells[0].paragraphs[0].add_run("User Role")
    hdr_r.cells[1].paragraphs[0].add_run("Pages Used")
    hdr_r.cells[2].paragraphs[0].add_run("Key Responsibilities")
    style_table_header(hdr_r, col_w_roles, "091A2D")
    
    for idx, r in enumerate(roles_data):
        row = tbl_roles.rows[idx + 1]
        row.cells[0].paragraphs[0].add_run(r[0]).bold = True
        row.cells[1].paragraphs[0].add_run(r[1])
        row.cells[2].paragraphs[0].add_run(r[2])
        style_table_row(row, col_w_roles, "F8FAFC" if idx % 2 == 1 else "FFFFFF")
        
    doc.add_paragraph().paragraph_format.space_after = Pt(8)

    # 9-Step Lifecycle
    doc.add_heading("2.2 Step-by-Step Incident Lifecycle (From Problem to Relief)", level=2)
    
    steps = [
        ("Step 1: Incident Spotting", "Citizen discovers an earthen levee breach or road washout in Ward 7 and opens the mobile app."),
        ("Step 2: Geotagged Capture", "Citizen snaps a photo and taps 'Detect GPS Pin' on report-problem.html, selecting category and headcount."),
        ("Step 3: Instant AI Analysis", "Google Gemini AI analyzes structural damage within 2 seconds, evaluating water rise, electrical risk, and urgency score (0-100)."),
        ("Step 4: Spatial Duplicate Check", "Haversine engine checks if any neighbor reported the same flood within 500m / 24h, grouping duplicates to avoid EOC clutter."),
        ("Step 5: EOC Officer Verification", "Disaster Director logs in to admin-dashboard.html via 6-digit OTP, sees high-priority P1 flag, and approves verification."),
        ("Step 6: Top-3 Fleet Match", "System evaluates all available assets and recommends the 3 closest units with matching capabilities (e.g., NDRF Rescue Boat 04)."),
        ("Step 7: One-Click Dispatch", "Officer clicks 'Dispatch'. Resource is assigned, mission is created (MSN-101), and travel ETA is logged."),
        ("Step 8: Field Action & Offline Replay", "Boat squad receives task on phone. If cell towers fail, team records rescues locally; phone auto-syncs when signal returns."),
        ("Step 9: Citizen Resolution Notice", "Citizen watches live progress bar on track.html (Logged -> AI Evaluated -> Responders En Route -> Resolved).")
    ]
    
    for s_title, s_desc in steps:
        p_step = doc.add_paragraph()
        p_step.paragraph_format.space_after = Pt(3)
        p_step.paragraph_format.line_spacing = 1.15
        r_st = p_step.add_run(f"• {s_title}: ")
        r_st.bold = True
        r_st.font.color.rgb = RGBColor(2, 132, 199)
        p_step.add_run(s_desc)
        
    doc.add_paragraph().paragraph_format.space_after = Pt(12)

    doc.add_heading("3. Complete Project Directory Structure", level=1)
    
    p = doc.add_paragraph()
    p.add_run("The repository is architectured into clean separation of concerns across presentation, domain logic, APIs, and persistence:")
    
    # Table of Directories
    tree_data = [
        ("api/", "Serverless Edge Entry", "Houses index.js Vercel serverless function entry delegating to clustered server runtime."),
        ("components/ui/", "React Component Library", "Houses reusable UI components such as prisma-hero.tsx, chronic-hero.tsx, and sign-in-page.tsx."),
        ("data/", "JSON Persistence Store", "Holds local persistent collections: incidents.json, missions.json, reports.json, resources.json, road-closures.json, sync-operations.json."),
        ("docs/", "System Documentation", "Houses comprehensive architecture diagrams, flow guides, product specifications, and Word/MD documentation."),
        ("public/html/", "Web Application Views", "Houses all 15 HTML page entry points including EOC console, landing page, tracking, and citizen reporting."),
        ("public/js/", "Client-Side Controllers", "Houses all 19 frontend modules including Leaflet emergency mapping, theme synchronization, and offline IndexedDB sync."),
        ("public/css/", "Styling & Design System", "Houses design tokens, glassmorphic UI rules, Day/Night theme synchronization, and ultra-responsive mobile media queries."),
        ("public/images/", "Tactical Visual Assets", "Photorealistic command center visuals (auth-command-center.jpg), panoramic melting footer landscapes, and disaster imagery."),
        ("server/domain/", "Domain Logic & State Machines", "Defines canonical entities (incident.js, operations.js, sync.js) and strict lifecycle status transitions."),
        ("server/services/", "Core Computational Engines", "Implements Gemini AI validation, priority scoring (P1-P4), spatial Haversine duplicate detection, Top-3 allocation, and delta sync."),
        ("server/routes/", "REST API Endpoints", "Express modular routers for /api/incidents, /api/resources, /api/missions, and /api/sync."),
        ("server/seed/", "Simulation Scenarios", "Houses ward7-scenario.js for 1-click seeding of Kolkata Ward 7 flash flood simulation."),
        ("server/server.js", "Clustered HA Supervisor", "Node.js cluster supervisor providing dual-worker fault tolerance, memory recycling, and heartbeat self-healing."),
        ("test/", "Automated Test Suite", "Comprehensive Node.js native test suite validating all 31 unit, domain, and API integration test cases.")
    ]
    
    tbl_tree = doc.add_table(rows=len(tree_data) + 1, cols=3)
    tbl_tree.alignment = WD_TABLE_ALIGNMENT.CENTER
    col_w = [Inches(1.6), Inches(1.8), Inches(3.1)]
    
    hdr = tbl_tree.rows[0]
    hdr.cells[0].paragraphs[0].add_run("Directory / File")
    hdr.cells[1].paragraphs[0].add_run("Role / Layer")
    hdr.cells[2].paragraphs[0].add_run("Functional Description")
    style_table_header(hdr, col_w, "091A2D")
    
    for i, row_data in enumerate(tree_data):
        row = tbl_tree.rows[i + 1]
        row.cells[0].paragraphs[0].add_run(row_data[0]).bold = True
        row.cells[1].paragraphs[0].add_run(row_data[1])
        row.cells[2].paragraphs[0].add_run(row_data[2])
        style_table_row(row, col_w, "F8FAFC" if i % 2 == 1 else "FFFFFF")

    doc.add_paragraph().paragraph_format.space_after = Pt(12)

    # -------------------------------------------------------------
    # 3. PAGE CATALOG (ALL 15 PAGES)
    # -------------------------------------------------------------
    doc.add_heading("3. Complete Page Catalog & Functional Mapping (15 Pages)", level=1)
    
    p = doc.add_paragraph()
    p.add_run(
        "ChronicAI provides 15 dedicated web interfaces tailored to four key personas: Citizens, Verified Field Workers, "
        "Emergency Operations Center (EOC) Directors, and Public Monitors. All interfaces feature dual Day/Night theme synchronization "
        "and mobile-optimized layouts."
    )
    
    pages = [
        {
            "name": "index.html (Main Public Landing Page)",
            "route": "/ or /index.html",
            "purpose": "Public municipal showcase & live situational dashboard.",
            "persona": "All Citizens, Responders, Government Officers",
            "scripts": "theme-manager.js, auth-guard.js, emergency-map.js",
            "apis": "GET /api/reports, GET /api/dashboard/briefing, GET /api/incidents",
            "features": "Interactive 3D digital twin, mobile capsule navigation with full drawer, EOC telemetry HUD with surveillance angle switcher, live casualty statistics strip, capabilities matrix, support plate, tactical Leaflet disaster radar map, and panoramic bi-directional melting footer."
        },
        {
            "name": "login.html (Citizen & Responder Sign-In)",
            "route": "/login or /login.html",
            "purpose": "Secure authentication portal for citizens and field inspectors.",
            "persona": "Registered Citizens, Field Workers",
            "scripts": "login.js, theme-manager.js, firebase-client.js",
            "apis": "Firebase Client Auth, POST /api/auth/send-otp",
            "features": "Split-screen layout with photorealistic EOC command visual (auth-command-center.jpg), live district telemetry status pill, 1-click demo credential auto-fill (demo@localhost / LocalDemo123!), password reveal toggle, Google and GitHub OAuth buttons, and Day/Night mode styling."
        },
        {
            "name": "register.html (Citizen Enrollment Portal)",
            "route": "/register or /register.html",
            "purpose": "Citizen profile creation and municipal credential setup.",
            "persona": "New Citizens, Disaster Volunteers",
            "scripts": "register.js, theme-manager.js, firebase-client.js",
            "apis": "Firebase Client Auth",
            "features": "Symmetrical split-screen layout matching login, full name capture, email validation, password confirmation validation, terms agreement, and Day/Night mode styling."
        },
        {
            "name": "admin-login.html (Two-Factor Authority Login)",
            "route": "/admin-login or /admin-login.html",
            "purpose": "Restricted government officer two-factor authentication.",
            "persona": "Authorized Government Officers, EOC Commandants",
            "scripts": "admin-login.js, theme-manager.js",
            "apis": "POST /api/auth/send-otp, POST /api/auth/verify-otp, GET /api/auth/email-health",
            "features": "Two-step verification flow: Step 1 verifies government email and dispatches 6-digit cryptographic token; Step 2 verifies time-expiring OTP (15-minute window) with countdown timer and automatic session state authorization."
        },
        {
            "name": "admin-dashboard.html (EOC Incident Command Console)",
            "route": "/admin-dashboard or /admin-dashboard.html",
            "purpose": "Central tactical operations desk for disaster directors.",
            "persona": "EOC Incident Commanders, Triage Officers",
            "scripts": "admin-dashboard.js, theme-manager.js, auth-guard.js",
            "apis": "GET /api/incidents, POST /api/incidents/:id/verify, POST /api/incidents/:id/merge, GET /api/resources/recommend/:id, POST /api/missions, POST /api/dashboard/seed-ward7",
            "features": "Live SitRep operational briefing, active canonical incidents table, P1-P4 priority tier badges, duplicate candidate merge dialog, algorithmic Top-3 resource recommendation modal, manual priority override with audit log, and 1-click Ward 7 flash flood simulation seeder."
        },
        {
            "name": "report-problem.html (Citizen Incident Filing)",
            "route": "/report-problem or /report-problem.html",
            "purpose": "Official geotagged hazard filing channel (Form INC-F01).",
            "persona": "Public Citizens, Field Observers",
            "scripts": "report-problem.js, theme-manager.js, auth-guard.js",
            "apis": "POST /api/analyze, POST /api/reports, POST /api/incidents",
            "features": "Device camera photo capture, GPS location pin with dimensional badge, structural category selector (flood breach, road washout, building fracture), casualty counts, live Gemini AI damage triage preview, and filing confirmation."
        },
        {
            "name": "complaint.html (Incident Audit Record & Timeline)",
            "route": "/complaint or /complaint.html",
            "purpose": "Detailed case file viewer for a specific filed incident.",
            "persona": "Filing Citizens, Assigned Officers, Auditors",
            "scripts": "complaint.js, theme-manager.js",
            "apis": "GET /api/reports/:reportId, GET /api/reports/:reportId/timeline",
            "features": "High-res damage evidence display, GPS coordinates, Gemini AI confidence breakdown, officer verification remarks, responding department assignment, and immutable chronological action timeline."
        },
        {
            "name": "track.html (Public Incident & Rescue Tracking)",
            "route": "/track or /track.html",
            "purpose": "Real-time incident progress and rescue unit telematics.",
            "persona": "Filing Citizens, Public Observers",
            "scripts": "rescue-tracking.js, theme-manager.js",
            "apis": "GET /api/reports/:reportId, GET /api/missions, GET /api/sync/road-closures",
            "features": "5-stage resolution progress bar (Logged → AI Triage → Officer Verified → Responders En Route → Resolved), interactive location pin, live ETA countdown, and active responder telematics."
        },
        {
            "name": "request.html (Emergency Distress & Evacuation Channel)",
            "route": "/request or /request.html",
            "purpose": "Rapid life-safety distress channel for stranded victims.",
            "persona": "Trapped Citizens, Vulnerable Populations",
            "scripts": "request.js, theme-manager.js",
            "apis": "POST /api/emergency-requests",
            "features": "Direct distress categories (Water Rescue Boat, Medical Evacuation, Potable Water, Emergency Rations), urgency flag, headcount capture, and direct escalation to EOC dispatch queue."
        },
        {
            "name": "resource-center.html (Relief Fleet & Shelter Directory)",
            "route": "/resource-center or /resource-center.html",
            "purpose": "Public municipal relief inventory and logistics locator.",
            "persona": "Displaced Citizens, NGOs, Relief Coordinators",
            "scripts": "resource-center.js, theme-manager.js",
            "apis": "GET /api/resources",
            "features": "Filterable catalog of operational relief shelters, emergency medical stations, food distribution depots, and potable water points with real-time occupancy rates and distance calculation."
        },
        {
            "name": "missing-persons.html (Civil Registry for Displaced Persons)",
            "route": "/missing-persons or /missing-persons.html",
            "purpose": "Displaced family member tracing and registry.",
            "persona": "Citizens, Family Members, Relief Volunteers",
            "scripts": "missing-persons.js, theme-manager.js",
            "apis": "GET /api/reports, POST /api/reports",
            "features": "Searchable missing persons registry, photo upload, physical descriptor tagging, last-known GPS coordinates, and automated cross-referencing with relief shelter check-in rolls and hospital logs."
        },
        {
            "name": "risk-dashboard.html (Meteorological & Hazard Analytics)",
            "route": "/risk-dashboard or /risk-dashboard.html",
            "purpose": "Environmental risk forecasting and disaster projections.",
            "persona": "City Engineers, Disaster Response Planners",
            "scripts": "risk-dashboard.js, theme-manager.js",
            "apis": "GET /api/risk",
            "features": "Live meteorological telematics integration, flood inundation modeling, wind velocity tracking, structural decay scores, and district risk index visualizations."
        },
        {
            "name": "life-helper.html (AI First-Aid & Survival Protocol Desk)",
            "route": "/life-helper or /life-helper.html",
            "purpose": "Emergency survival guides and interactive first-aid chatbot.",
            "persona": "Citizens in Crisis Situations",
            "scripts": "theme-manager.js",
            "apis": "POST /api/chat",
            "features": "Step-by-step survival protocols for treating severe fractures, burns, hypothermia, clean water purification, offline survival guides, and interactive AI emergency chat."
        },
        {
            "name": "support.html (Relief Donations & Volunteer Corps)",
            "route": "/support or /support.html",
            "purpose": "Citizen aid pipeline for donations and volunteer sign-ups.",
            "persona": "Donors, Civic Volunteers, Partner NGOs",
            "scripts": "support.js, theme-manager.js",
            "apis": "POST /api/support-requests, GET /api/admin/support-requests",
            "features": "Direct relief fund contributions, physical supply donations (rations, medical kits, blankets), and accredited municipal volunteer corps application forms."
        },
        {
            "name": "journey.html (Citizen Lifecycle Walkthrough)",
            "route": "/journey or /journey.html",
            "purpose": "Interactive educational walkthrough of civic incident flow.",
            "persona": "Public Observers, Civil Auditors",
            "scripts": "journey.js, theme-manager.js",
            "apis": "Static / Demo Simulator",
            "features": "Step-by-step interactive timeline explaining the lifecycle from initial citizen mobile capture, through Gemini AI triage, EOC verification, fleet dispatch, and road re-opening."
        }
    ]
    
    for p_info in pages:
        doc.add_heading(p_info["name"], level=2)
        p_desc = doc.add_paragraph()
        p_desc.paragraph_format.line_spacing = 1.15
        p_desc.paragraph_format.space_after = Pt(4)
        
        r1 = p_desc.add_run("URL Route: ")
        r1.bold = True
        p_desc.add_run(f"{p_info['route']}\n")
        
        r2 = p_desc.add_run("Target Persona: ")
        r2.bold = True
        p_desc.add_run(f"{p_info['persona']}\n")
        
        r3 = p_desc.add_run("Primary Purpose: ")
        r3.bold = True
        p_desc.add_run(f"{p_info['purpose']}\n")
        
        r4 = p_desc.add_run("Client Scripts: ")
        r4.bold = True
        p_desc.add_run(f"{p_info['scripts']}\n")
        
        r5 = p_desc.add_run("APIs Consumed: ")
        r5.bold = True
        p_desc.add_run(f"{p_info['apis']}\n")
        
        r6 = p_desc.add_run("Key Features: ")
        r6.bold = True
        p_desc.add_run(f"{p_info['features']}\n")
        
        doc.add_paragraph().paragraph_format.space_after = Pt(4)

    # -------------------------------------------------------------
    # 4. REST API SPECIFICATION
    # -------------------------------------------------------------
    doc.add_heading("4. Exhaustive REST API Specification", level=1)
    
    p = doc.add_paragraph()
    p.add_run(
        "All ChronicAI endpoints support JSON request and response envelopes, standard HTTP status codes, and optional "
        "Idempotency-Key headers to guarantee safe network retries under volatile field conditions."
    )
    
    apis_grouped = [
        ("4.1 Incident Management APIs (/api/incidents)", [
            ("GET /api/incidents", "Public / Officers", "Fetch paginated, filterable list of canonical incidents.", "status, priority, category, q, limit, offset", "200 OK: { success: true, total, incidents: [...] }"),
            ("GET /api/incidents/:id", "Public / Officers", "Retrieve detailed canonical incident record and audit event timeline.", "id (Path)", "200 OK: { success: true, incident: {...} }, 404: Not Found"),
            ("POST /api/incidents", "Public / Officers", "Create new canonical incident with structured AI validation & priority score.", "JSON body: title, description, category, location, casualties", "201 Created: { success: true, incident: {...} }"),
            ("POST /api/incidents/:id/verify", "Government Officer", "Verify incident, promote status to VERIFIED, and optionally override priority.", "id (Path), JSON body: priority, overrideJustification, notes", "200 OK: { success: true, incident: {...} }"),
            ("POST /api/incidents/:id/reject", "Government Officer", "Reject spurious, fraudulent, or resolved incident.", "id (Path), JSON body: reason, notes", "200 OK: { success: true, incident: {...} }"),
            ("GET /api/incidents/:id/duplicate-candidates", "Government Officer", "Detect nearby duplicate incidents within spatial radius and temporal window.", "id (Path), radiusMeters, timeWindowHours", "200 OK: { success: true, candidates: [...] }"),
            ("POST /api/incidents/:id/merge", "Government Officer", "Merge duplicate candidate incidents into primary incident without data loss.", "id (Path), JSON body: sourceIncidentIds, notes", "200 OK: { success: true, incident: {...} }"),
            ("POST /api/incidents/:id/priority-score", "Officers / Engine", "Recalculate dynamic priority score based on updated casualty or risk data.", "id (Path)", "200 OK: { success: true, priorityScore, tier }"),
            ("POST /api/incidents/calculate-priority", "Public / Calculator", "Stateless priority tier and score calculation utility.", "JSON body: category, casualties, hazardFlags", "200 OK: { score, priority }")
        ]),
        ("4.2 Resource Registry & Fleet Allocation APIs (/api/resources)", [
            ("GET /api/resources", "Public / Officers", "List registered municipal emergency fleet units and operational status.", "type, status", "200 OK: { success: true, total, resources: [...] }"),
            ("GET /api/resources/recommend/:incidentId", "Government Officer", "Algorithmic Top-3 resource recommendation for an incident.", "incidentId (Path), limit (default 3)", "200 OK: { success: true, recommendations: [...] }"),
            ("GET /api/resources/:id", "Public / Officers", "Retrieve details for a specific resource asset.", "id (Path)", "200 OK: { success: true, resource: {...} }, 404"),
            ("POST /api/resources", "Government Admin", "Register a new vehicle, medical team, or shelter asset in the fleet.", "JSON body: name, type, capabilities, capacity, location", "201 Created: { success: true, resource: {...} }"),
            ("PATCH /api/resources/:id/status", "Officers / Responders", "Update resource status (AVAILABLE, DISPATCHED, MAINTENANCE).", "id (Path), JSON body: status", "200 OK: { success: true, resource: {...} }")
        ]),
        ("4.3 Mission Dispatch & Execution APIs (/api/missions)", [
            ("GET /api/missions", "Officers / Responders", "List active, en-route, or completed response missions.", "incidentId, resourceId, status, assignedTo", "200 OK: { success: true, missions: [...] }"),
            ("GET /api/missions/:id", "Officers / Responders", "Retrieve specific mission dispatch details.", "id (Path)", "200 OK: { success: true, mission: {...} }, 404"),
            ("POST /api/missions", "Government Officer", "Atomically dispatch resource to incident; updates resource and incident statuses.", "JSON body: incidentId, resourceId, assignedTo, etaMinutes", "201 Created: { success: true, mission, resource, incident }"),
            ("PATCH /api/missions/:id/status", "Field Responders", "Progress mission status: EN_ROUTE -> ARRIVED -> IN_PROGRESS -> COMPLETED.", "id (Path), JSON body: status, notes", "200 OK: { success: true, mission: {...} }")
        ]),
        ("4.4 Offline Field Synchronization APIs (/api/sync)", [
            ("POST /api/sync/push", "Field Responders", "Batch upload offline operations queued in local IndexedDB.", "JSON body: operations array with operationId and timestamps", "200 OK: { success: true, applied, skipped, failed }"),
            ("GET /api/sync/pull", "Field Responders", "Delta pull returning all data updated since given timestamp.", "sinceTimestamp, assignedTo", "200 OK: { incidents, missions, roadClosures, timestamp }"),
            ("GET /api/sync/status/:operationId", "Field Responders", "Check sync processing status of a specific operation ID.", "operationId (Path)", "200 OK: { success: true, operation: {...} }, 404"),
            ("GET /api/sync/road-closures", "Public / Navigation", "Retrieve active road closures, breached bridges, and hazard corridors.", "None", "200 OK: { success: true, roadClosures: [...] }")
        ]),
        ("4.5 AI Analysis, Two-Factor Auth & Telemetry APIs", [
            ("POST /api/analyze", "Public / Forms", "Autonomous Gemini AI severity analysis with heuristic fallback.", "JSON body: description, imageData", "200 OK: { success: true, analysis: {...} }"),
            ("POST /api/chat", "Public / Citizens", "Interactive First-Aid & Survival Assistant conversational endpoint.", "JSON body: message, history", "200 OK: { reply: '...' }"),
            ("POST /api/auth/send-otp", "Government Officers", "Dispatch 6-digit cryptographic authentication token via SMTP email.", "JSON body: email", "200 OK: { success: true, expiresInSeconds: 900 }"),
            ("POST /api/auth/verify-otp", "Government Officers", "Verify 6-digit token and issue signed authority session.", "JSON body: email, otp", "200 OK: { success: true, sessionToken, user }"),
            ("GET /api/dashboard/briefing", "Government Officers", "Generates real-time EOC SitRep briefing summarizing casualties and fleet readiness.", "None", "200 OK: { success: true, briefing: {...} }"),
            ("POST /api/dashboard/seed-ward7", "Government Admin", "One-click scenario seeder populating Ward 7 flash flood simulation data.", "None", "200 OK: { success: true, message: 'Seeded' }"),
            ("GET /api/risk", "Public / Analytics", "Environmental hazard and meteorological risk projection endpoint.", "lat, lng", "200 OK: { score, weather, floodWarning }")
        ])
    ]
    
    col_w_api = [Inches(1.8), Inches(1.1), Inches(2.2), Inches(1.4)]
    
    for group_title, endpoints in apis_grouped:
        doc.add_heading(group_title, level=2)
        tbl_api = doc.add_table(rows=len(endpoints) + 1, cols=4)
        tbl_api.alignment = WD_TABLE_ALIGNMENT.CENTER
        
        hdr = tbl_api.rows[0]
        hdr.cells[0].paragraphs[0].add_run("HTTP Method & Route")
        hdr.cells[1].paragraphs[0].add_run("Access")
        hdr.cells[2].paragraphs[0].add_run("Purpose")
        hdr.cells[3].paragraphs[0].add_run("Parameters")
        style_table_header(hdr, col_w_api, "0284C7")
        
        for idx, ep in enumerate(endpoints):
            row = tbl_api.rows[idx + 1]
            row.cells[0].paragraphs[0].add_run(ep[0]).bold = True
            row.cells[1].paragraphs[0].add_run(ep[1])
            row.cells[2].paragraphs[0].add_run(ep[2])
            row.cells[3].paragraphs[0].add_run(ep[3])
            style_table_row(row, col_w_api, "F0F9FF" if idx % 2 == 1 else "FFFFFF")
            
        doc.add_paragraph().paragraph_format.space_after = Pt(10)

    # -------------------------------------------------------------
    # 5. CORE ENGINES
    # -------------------------------------------------------------
    doc.add_heading("5. Core Architectural Engines & Algorithms", level=1)
    
    doc.add_heading("5.1 Multi-Dimensional Priority Engine (P1 - P4)", level=2)
    p = doc.add_paragraph()
    p.add_run(
        "The Priority Engine computes a compound hazard score (0 to 100) based on four weighted vectors: Human Threat (40%), "
        "Infrastructure Criticality (30%), Escalation Velocity (20%), and Verification Multiplier (10%).\n\n"
        "• P1 (Score 80-100): Imminent life threat, active building collapse, primary levee breach.\n"
        "• P2 (Score 60-79): Critical infrastructure cutoff, rising flood waters near power sub-stations.\n"
        "• P3 (Score 35-59): Non-life-safety civic obstruction, blocked secondary arterial routes.\n"
        "• P4 (Score 0-34): Routine maintenance, cosmetic municipal fissures, minor road potholes."
    )
    
    doc.add_heading("5.2 Spatial Haversine Proximity & Duplicate Clustering", level=2)
    p = doc.add_paragraph()
    p.add_run(
        "To prevent duplicate dispatches when hundreds of citizens report the same incident, the system calculates great-circle "
        "distances using the Haversine equation. Reports occurring within 500 meters and 24 hours of an existing incident are "
        "flagged for automatic consolidation, merging citizen witness logs without overwriting original submissions."
    )

    doc.add_heading("5.3 Top-3 Algorithmic Fleet Allocation", level=2)
    p = doc.add_paragraph()
    p.add_run(
        "Candidate fleet units are scored via a multi-attribute utility function evaluating capability compatibility (e.g. shallow-draft "
        "boats for water rescue), travel distance from incident coordinates, and readiness tier. The top 3 ranked units are returned "
        "to the EOC commander with calculated ETAs and route safety warnings."
    )

    doc.add_heading("5.4 Universal Theme Synchronization Architecture", level=2)
    p = doc.add_paragraph()
    p.add_run(
        "The application enforces unified Day Mode (light theme) and Night Mode (dark theme) via public/js/theme-manager.js. "
        "Theme toggles are synchronized across tabs via localStorage and broadcast custom window events to update dynamic Leaflet "
        "GIS map layers, 3D WebGL canvases, and split-screen auth layouts with zero visual flicker."
    )

    # -------------------------------------------------------------
    # 6. PERSISTENCE SCHEMAS
    # -------------------------------------------------------------
    doc.add_heading("6. Data Persistence & Model Schemas", level=1)
    p = doc.add_paragraph()
    p.add_run("The system persists operational data across structured JSON collections under data/:")
    
    schemas = [
        ("Canonical Incident Entity", "incidents.json", "incidentId, title, description, category, priority, priorityScore, status, location (lat, lng, address), casualties (dead, injured, trapped), sourceReportIds, assignedDepartment, assignedResources, events audit array, createdAt, updatedAt."),
        ("Response Mission Entity", "missions.json", "id, incidentId, resourceId, assignedTo, status (DISPATCHED, EN_ROUTE, ARRIVED, IN_PROGRESS, COMPLETED, BLOCKED), etaMinutes, routeRisk, notes, dispatchedAt, completedAt."),
        ("Resource Asset Entity", "resources.json", "id, name, type (AMBULANCE, BOAT, ENGINEERING, SHELTER), status (AVAILABLE, DISPATCHED, MAINTENANCE), capacity, location, capabilities array, contact."),
        ("Offline Sync Ledger", "sync-operations.json", "operationId, type (UPDATE_MISSION_STATUS, REPORT_ROAD_CLOSURE), status, appliedAt, error, actor."),
        ("Road Closure Entity", "road-closures.json", "closureId, location (lat, lng), description, severity, reportedBy, timestamp, clearedAt.")
    ]
    
    col_w_sch = [Inches(1.8), Inches(1.4), Inches(3.3)]
    tbl_sch = doc.add_table(rows=len(schemas) + 1, cols=3)
    tbl_sch.alignment = WD_TABLE_ALIGNMENT.CENTER
    
    hdr = tbl_sch.rows[0]
    hdr.cells[0].paragraphs[0].add_run("Entity Model")
    hdr.cells[1].paragraphs[0].add_run("JSON Store")
    hdr.cells[2].paragraphs[0].add_run("Key Attributes & Schema Fields")
    style_table_header(hdr, col_w_sch, "0F172A")
    
    for idx, s in enumerate(schemas):
        row = tbl_sch.rows[idx + 1]
        row.cells[0].paragraphs[0].add_run(s[0]).bold = True
        row.cells[1].paragraphs[0].add_run(s[1])
        row.cells[2].paragraphs[0].add_run(s[2])
        style_table_row(row, col_w_sch, "F8FAFC" if idx % 2 == 1 else "FFFFFF")

    doc.add_paragraph().paragraph_format.space_after = Pt(12)

    # -------------------------------------------------------------
    # 7. DEPLOYMENT & DEVOPS
    # -------------------------------------------------------------
    doc.add_heading("7. Clustered HA Supervisor & Deployment Architecture", level=1)
    p = doc.add_paragraph()
    p.add_run(
        "Production execution is managed by server/server.js using Node.js cluster supervisor mode:\n\n"
        "• Dual Worker HA Pool: Supervisor forks two independent worker processes running firebase.js with round-robin request distribution.\n"
        "• Self-Healing Watchdog: Heartbeat probes execute every 2000ms. If a worker misses health checks or exceeds 768MB RSS memory, it is automatically recycled and replaced without request dropped.\n"
        "• Dynamic Port Probing: Probes available ports starting at $PORT (default 3000) across 25 candidates to prevent address conflicts.\n"
        "• Edge Deployment (Vercel): Aliased to https://chronicai-kappa.vercel.app with clean routing rules in vercel.json mapping root paths to /public/html/ without exposing file extensions."
    )

    doc.add_heading("8. Environment Configuration Reference", level=1)
    
    env_vars = [
        ("PORT", "3000", "Primary network port for Express web server."),
        ("GEMINI_API_KEY", "Required", "Google Gemini AI Vision API key for multimodal damage triage."),
        ("EMAIL_USER", "Optional", "SMTP username / address for outbound 2FA OTP codes."),
        ("EMAIL_PASS", "Optional", "SMTP application-specific password."),
        ("SMTP_HOST", "smtp.gmail.com", "Hostname for outbound SMTP email server."),
        ("SMTP_PORT", "587", "Port for outbound SMTP server (465 SSL or 587 TLS)."),
        ("HA_WORKERS", "2", "Number of worker processes supervised by cluster supervisor."),
        ("HA_HEARTBEAT_MS", "2000", "Interval between worker process health probes."),
        ("HA_MAX_RSS_MB", "768", "Maximum memory limit before worker process recycling."),
        ("CHRONICAI_ENV", "development", "Runtime environment mode (production / development).")
    ]
    
    col_w_env = [Inches(1.8), Inches(1.2), Inches(3.5)]
    tbl_env = doc.add_table(rows=len(env_vars) + 1, cols=3)
    tbl_env.alignment = WD_TABLE_ALIGNMENT.CENTER
    
    hdr = tbl_env.rows[0]
    hdr.cells[0].paragraphs[0].add_run("Variable Name")
    hdr.cells[1].paragraphs[0].add_run("Default / Value")
    hdr.cells[2].paragraphs[0].add_run("Operational Purpose")
    style_table_header(hdr, col_w_env, "0284C7")
    
    for idx, env in enumerate(env_vars):
        row = tbl_env.rows[idx + 1]
        row.cells[0].paragraphs[0].add_run(env[0]).bold = True
        row.cells[1].paragraphs[0].add_run(env[1])
        row.cells[2].paragraphs[0].add_run(env[2])
        style_table_row(row, col_w_env, "F0F9FF" if idx % 2 == 1 else "FFFFFF")

    # Output file
    output_path = os.path.join("d:\\My Project\\Chronic-\\docs", "ChronicAI-Full-System-Documentation.docx")
    doc.save(output_path)
    print(f"Successfully generated: {output_path}")

if __name__ == "__main__":
    main()
