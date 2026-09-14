# ChronicAI — Simple Plain Guide & Application Workflow
*A beginner-friendly, plain-English explanation of how ChronicAI works, who uses it, and how all pages and APIs connect together.*

---

## 1. What is ChronicAI in Simple Words?

Imagine if **911 / Emergency Services** and **Uber** had an intelligent AI baby designed specifically for city disasters and infrastructure breakdowns. That is **ChronicAI**.

When a flood happens, a bridge cracks, or roads get washed away:
- People usually panic and phone lines get jammed.
- Hundreds of people call about the same broken levee.
- Emergency directors don't know which problem is life-threatening (someone drowning) versus minor (a pothole).
- Rescue teams don't know the safest or closest routes to take.

**ChronicAI fixes this automatically:**
1. A citizen takes a photo on their phone.
2. An AI analyzes the photo in 2 seconds to check if lives are in danger.
3. The system merges duplicate reports so officers aren't overwhelmed.
4. The system recommends the closest rescue boats, ambulances, or engineers.
5. Officers click **"Dispatch"** with one button.
6. Field teams get the order on their phones—**even if the internet is down**.
7. The citizen can watch the rescue vehicle coming to help on a live tracker map.

---

## 2. Who Uses ChronicAI? (The 4 Main Roles)

| Role | Who are they? | Dedicated Stakeholder Dashboard | What do they do? |
|:---|:---|:---|:---|
| **1. Everyday Citizen** | Anyone in the city / disaster zone | `citizen-dashboard.html` (Citizen Operations Portal) | Reports broken roads or floods, asks for rescue if trapped, monitors live responder vehicle ETA, finds open relief shelters. |
| **2. Emergency Officer** | City officials, disaster directors, police/fire chiefs | `admin-dashboard.html` (EOC Command Center) | Verifies incidents, reviews AI SitRep briefings, evaluates Top-3 recommended fleet resources, issues 1-click dispatches, seeds drills. |
| **3. Field Responders** | NDRF rescue boats, ambulance drivers, repair crews | `responder-dashboard.html` (Tactical Mission Console) | Receives dispatched missions, 1-tap tactical progression (En Route -> Arrived -> Extricating -> Done), logs road hazards, works offline. |
| **4. Donors & Volunteers** | Citizens wanting to help | `support.html`, `resource-center.html`, `missing-persons.html` | Donates food/funds, finds open relief shelters, searches for missing relatives displaced by disasters. |

---

## 3. End-to-End Application Workflow (How Everything Works Step-by-Step)

Here is the exact journey of an incident through the whole system:

```text
[CITIZEN]                             [AI BRAIN]                         [EOC COMMAND CENTER]
Takes photo of disaster               Analyzes damage & risk             Officer logs in with OTP
Fills GPS location & report     --->  Scores Priority (P1-P4)      --->  Reviews verified incident
Submits on report-problem.html         Filters out duplicates             Views recommended boats & squads
                                                                                 |
                                                                                 v
[CITIZEN TRACKER]                     [OFFLINE RESCUE CREW]               [DISPATCH ENGINE]
Watches live progress bar             Receives mission on phone           Officer clicks "Dispatch"
Sees vehicle ETA & status       <---  Marks "Arrived" & "Saved"    <---  Mission created (MSN-101)
Incident marked "Resolved"            Syncs back when online              Resource marked "Dispatched"
```

### Step 1: The Citizen Discovers an Emergency
- A citizen sees a flash flood breaking an earthen dam or levee in Ward 7.
- They open `https://chronicai-kappa.vercel.app/report-problem.html` on their smartphone.

### Step 2: Filing the Report
- They tap **"Capture Photo Evidence"** to snap a photo with their camera.
- They tap **"Detect My Location"** which uses their phone's GPS to find the exact latitude and longitude.
- They pick the category (Flood, Road Washout, Building Fracture) and mention if anyone is trapped or injured.
- They hit **Submit**.

### Step 3: The AI Evaluates the Danger in Seconds
- The photo and description are sent to the backend (`POST /api/analyze`).
- Google Gemini AI looks at the image:
  - Is the water high?
  - Are electrical power boxes submerged?
  - Are buildings cracking?
- The **Priority Engine** calculates a score from 0 to 100:
  - **P1 (Score 80-100)**: Immediate Life Threat (e.g. water rising, trapped citizens).
  - **P2 (Score 60-79)**: High Urgency (e.g. major bridge impassable).
  - **P3 (Score 35-59)**: Moderate Issue (e.g. tree fallen on road).
  - **P4 (Score 0-34)**: Minor Maintenance (e.g. small leak, cosmetic crack).

### Step 4: Duplicate Filter Kicks In
- What if 20 neighbors all take pictures of the exact same flood?
- The **Haversine Duplicate Engine** checks:
  - Is there another report within **500 meters**?
  - Was it filed within the last **24 hours**?
- If yes, it groups them under **one master incident** so emergency phone lines and screens don't get cluttered.

### Step 5: Emergency Officer Reviews on Admin Console
- The city disaster officer opens `admin-login.html`.
- They enter their government email and receive a secure 6-digit code (valid for 15 minutes).
- Once logged in, they are on `admin-dashboard.html`.
- The new flood incident flashes in red as **[P1 - CRITICAL]**.
- The officer clicks **"Verify Incident"**.

### Step 6: System Suggests the Top 3 Best Rescue Teams
- The officer clicks **"Find Responders"** (`GET /api/resources/recommend/:id`).
- The system automatically compares all available resources:
  - *Does this need a boat or a bulldozer?* (A flood needs a boat, not an ambulance).
  - *Who is closest?* (Calculates travel distance).
  - *Who is available right now?*
- The screen shows:
  1. **NDRF Rescue Boat 04** (1.2 km away — ETA 8 mins) — 94% Match
  2. **Inflatable Raft Squad B** (2.1 km away — ETA 14 mins) — 88% Match
  3. **Civil Defense Flood Unit** (3.5 km away — ETA 22 mins) — 79% Match

### Step 7: One-Click Dispatch
- The officer clicks **"Dispatch"** on NDRF Rescue Boat 04.
- Instantly:
  - A new Mission is generated (`MSN-2026-101`).
  - The Boat's status changes from `AVAILABLE` to `DISPATCHED`.
  - The Incident status changes to `ASSIGNED`.

### Step 8: Responders Move (Even Offline!)
- The boat crew gets the mission coordinates on their phones.
- **What if cell service is broken by the storm?**
  - ChronicAI uses an **Offline Sync Engine** (`field-offline-sync.js`).
  - Responders can mark "Arrived on Scene", "Rescued 14 People", or "Road Blocked".
  - The app stores this locally on the phone.
  - The second the phone catches even 1 bar of Wi-Fi or cellular signal, all updates automatically batch-upload to the main server!

### Step 9: Citizen Tracks Everything Live
- The citizen who filed the report opens `track.html`.
- They see a real-time progress bar:
  `Logged` -> `AI Analyzed` -> `Officer Verified` -> `Rescue Boat En Route` -> `Resolved`
- They see an ETA countdown and know help is on the way.

---

## 4. Simple Page Guide (Which Page Does What?)

| Page URL | Name | Plain English Purpose |
|:---|:---|:---|
| `/` or `/index.html` | **Home Page** | The main website. Shows live city emergency stats, 3D radar map, and links to all services. |
| `/login.html` | **Unified Login & Role Gateway** | Stakeholder login gateway with 3 tabs (`Citizen`, `EOC Officer`, `Field Unit`) and 1-click instant demo access. |
| `/citizen-dashboard.html` | **Citizen Operations Portal** | Dedicated citizen home showing active reports, live rescue dispatch tracker, SOS emergency actions, and shelter directory. |
| `/admin-dashboard.html` | **EOC Command Center** | High-level situation room for emergency officers to verify incidents, review SitRep briefings, and dispatch resources. |
| `/responder-dashboard.html` | **Field Tactical Mission Console** | Mobile-first console for NDRF boats and ambulances to progress active missions (`En Route` -> `Arrived` -> `Completed`) even offline. |
| `/register.html` | **Sign Up** | Where new users create an account. |
| `/admin-login.html` | **Officer Login** | Restricted login for disaster chiefs. Sends a 6-digit code to their email. |
| `/report-problem.html` | **Report Emergency** | The form where citizens upload photos of damage, drop GPS pins, and get an instant AI risk rating. |
| `/track.html` | **Live Tracking** | Where citizens track their complaint and watch rescue boats/ambulances coming. |
| `/request.html` | **Urgent Aid Request** | Emergency SOS button for stranded citizens needing food, clean water, or boat evacuation right now. |
| `/resource-center.html` | **Shelters & Supplies** | A map and list of open relief camps, free food centers, and clean water stations. |
| `/missing-persons.html` | **Find Loved Ones** | A lost-and-found registry where people search for missing relatives displaced by the disaster. |
| `/risk-dashboard.html` | **Weather & Flood Risk** | Shows weather forecasts, rainfall, river flood risk levels, and storm warnings. |
| `/life-helper.html` | **Survival First-Aid** | Offline emergency guides for treating wounds, making dirty water safe to drink, and surviving blackouts. |
| `/support.html` | **Donate & Volunteer** | Where people can donate money, drop off blankets and food, or sign up as volunteers. |
| `/complaint.html` | **Incident Case File** | A detailed page showing the full history, photos, and officer notes of one specific report. |

---

## 5. Simple API Guide (How the Website Talks to the Backend)

When you click buttons on the website, your browser talks to the server using **APIs**. Here is what the main APIs do in plain language:

### 1. Incident APIs (`/api/incidents`)
- `GET /api/incidents`: "Server, give me all active emergencies in the city so I can show them on the map."
- `POST /api/incidents`: "Server, create a new incident for this broken bridge with its photo and coordinates."
- `POST /api/incidents/:id/verify`: "Server, I am an officer. I have verified this flood is real. Change status to Verified."
- `POST /api/incidents/:id/merge`: "Server, these 3 reports are about the same broken levee. Combine them into one."

### 2. Fleet & Resource APIs (`/api/resources`)
- `GET /api/resources`: "Server, show me all rescue boats, ambulances, and fire trucks in the city."
- `GET /api/resources/recommend/:incidentId`: "Server, calculate the top 3 best and closest rescue teams for this specific flood."

### 3. Mission APIs (`/api/missions`)
- `POST /api/missions`: "Server, dispatch Rescue Boat 04 to Ward 7 right now!"
- `PATCH /api/missions/:id/status`: "Server, Rescue Boat 04 has just arrived at the scene."

### 4. Offline Sync APIs (`/api/sync`)
- `POST /api/sync/push`: "Server, my phone was offline during the storm. Here are the 5 updates I saved while disconnected."
- `GET /api/sync/pull`: "Server, tell me everything that changed while I was out in the field."

### 5. AI & Simulation APIs
- `POST /api/analyze`: "AI Gemini, look at this photo and description and tell me how bad it is."
- `POST /api/dashboard/seed-ward7`: "Server, set up a full flood disaster simulation in Ward 7 so we can test the system!"

---

## 6. How to Test and Use It Right Now

You can test the entire application locally or on the live web:

### Verified Stakeholder Evaluation Credentials
You can log in as any of the three distinct stakeholders using the sign-in form on `login.html`:

| Stakeholder Role | Evaluation Email | Accepted Password | Target Dashboard | Access Scope |
|:---|:---|:---|:---|:---|
| **1. Citizen (Public Lifeline)** | `citizen@chronic.gov` | `LocalDemo123!` or `LocalDemo123` | `citizen-dashboard.html` | Public relief, incident reporting, live rescue tracking |
| **2. Emergency Officer (EOC Command)** | `officer@chronic.gov` | `LocalDemo123!` or `LocalDemo123` | `admin-dashboard.html` | Authority command, AI SitRep, Top-3 dispatch, Ward 7 drill |
| **3. Field Responder (NDRF Unit 04)** | `responder@chronic.gov` | `LocalDemo123` or `LocalDemo123!` | `responder-dashboard.html` | Tactical mission progression, route hazards, offline logging |

> [!TIP]
> **Password Flexibility:** The authentication system accepts both `LocalDemo123!` (with exclamation mark) and `LocalDemo123` (without exclamation mark), as well as case variations, for all evaluation accounts.

### Quick Live Test (Online)
1. Open the live site: **[https://chronicai-kappa.vercel.app/](https://chronicai-kappa.vercel.app/)**
2. Click **"Sign In"** (`login.html`).
3. Enter any of the 3 stakeholder credentials above, or click the 1-click Stakeholder card.
4. Verify you land directly on the correct dashboard for your role with strict role separation.

---
*Created for ChronicAI Platform — Simple, Clear & Comprehensive.*
