// ============================================================
// CHRONICAI — BACKEND SERVER
// Express + Gemini AI
// Civic Report Analysis
// Authority Routing
// Report Management
// Admin Status Update
// SLA Monitoring
// Automatic Escalation
// Frontend Server
// ============================================================

"use strict";

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { getDatabase as getAdminDatabase } from "firebase-admin/database";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { sendEmail } from "./email-service.js";
import { consumeVerificationToken, createOtpChallenge, discardOtpChallenge, getOtpConfiguration, verifyOtp } from "./otp-service.js";

// ============================================================
// ENVIRONMENT
// ============================================================

dotenv.config({
    path: path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "..",
        ".env"
    ),
    override: true
});

// ============================================================
// ES MODULE PATH
// ============================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================
// APP
// IMPORTANT: app MUST be created before app.get/app.post
// ============================================================

const app = express();

const PORT = Number(process.env.PORT) || 3000;
const otpRateLimit = new Map();
const supportRequestRateLimit = new Map();
const locationGeocodeCache = new Map();

async function geocodeLocation(location) {
    const query = cleanText(location, 500);
    if (!query) return { latitude: null, longitude: null };
    if (locationGeocodeCache.has(query)) return locationGeocodeCache.get(query);
    try {
        const osmSearch = new URLSearchParams({ format: "jsonv2", limit: "1", countrycodes: "in", q: query });
        const osmResult = await fetchJsonWithTimeout(`https://nominatim.openstreetmap.org/search?${osmSearch}`, 8000, { "User-Agent": "ChronicAI government dashboard" });
        const osmMatch = osmResult?.[0];
        if (osmMatch) {
            const coordinates = { latitude: Number(osmMatch.lat), longitude: Number(osmMatch.lon) };
            locationGeocodeCache.set(query, coordinates);
            return coordinates;
        }
        const parts = query.split(",").map((part) => part.trim()).filter(Boolean);
        const country = parts.at(-1) || "";
        const namedPlace = parts.find((part) => /kolkata|barrackpore|district|west bengal/i.test(part)) || "";
        const cityCandidate = /kolkata/i.test(namedPlace) ? "Kolkata" : namedPlace;
        const candidates = [...new Set([
            `${cityCandidate}, ${country}`,
            query,
            `${parts.slice(0, 3).join(", ")}, ${country}`,
            `${parts.slice(1, 4).join(", ")}, ${country}`,
            `${namedPlace}, ${country}`,
            country
        ].filter((candidate) => candidate.length >= 3))];
        let match;
        for (const candidate of candidates) {
            const search = new URLSearchParams({ name: candidate, count: "1", language: "en", format: "json" });
            const result = await fetchJsonWithTimeout(`https://geocoding-api.open-meteo.com/v1/search?${search}`);
            if (result?.results?.[0]) {
                match = result.results[0];
                break;
            }
        }
        const coordinates = { latitude: match?.latitude ?? null, longitude: match?.longitude ?? null };
        locationGeocodeCache.set(query, coordinates);
        return coordinates;
    } catch {
        const coordinates = { latitude: null, longitude: null };
        locationGeocodeCache.set(query, coordinates);
        return coordinates;
    }
}

function allowOtpRequest(request) {
    const forwarded = request.headers["x-forwarded-for"];
    const ip = String(forwarded || request.ip || "unknown").split(",")[0].trim();
    const key = `${ip}:${cleanText(request.body?.type, 20)}:${cleanText(request.body?.identifier, 200).toLowerCase()}`;
    const now = Date.now();
    const previous = otpRateLimit.get(key) || { count: 0, startedAt: now };
    if (now - previous.startedAt > 60 * 60 * 1000) {
        otpRateLimit.set(key, { count: 1, startedAt: now });
        return true;
    }
    if (previous.count >= 10) return false;
    previous.count += 1;
    otpRateLimit.set(key, previous);
    return true;
}

// ============================================================
// DIRECTORIES
// ============================================================

const PROJECT_ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(PROJECT_ROOT, "public");
const HTML_DIR = path.join(PUBLIC_DIR, "html");

const DATA_DIR = path.join(
    PROJECT_ROOT,
    "data"
);

const REPORTS_FILE = path.join(
    DATA_DIR,
    "reports.json"
);

// ============================================================
// CREATE DATA DIRECTORY
// ============================================================

fs.mkdirSync(DATA_DIR, {
    recursive: true
});

// ============================================================
// CREATE REPORT DATABASE
// ============================================================

if (!fs.existsSync(REPORTS_FILE)) {
    fs.writeFileSync(
        REPORTS_FILE,
        "[]",
        "utf8"
    );
}

// ============================================================
// SECURITY
// ============================================================

app.disable("x-powered-by");

// ============================================================
// CORS
// ============================================================

app.use(
    cors({
        origin: true,
        credentials: false
    })
);

// ============================================================
// BODY PARSER
// ============================================================

app.use(
    express.json({
        limit: "20mb"
    })
);

app.use(
    express.urlencoded({
        extended: true,
        limit: "20mb"
    })
);

// ============================================================
// CLEAN TEXT
// ============================================================

function cleanText(
    value,
    maxLength = 5000
) {
    if (typeof value !== "string") {
        return "";
    }

    return value
        .trim()
        .slice(0, maxLength);
}

// ============================================================
// CLEAN ARRAY
// ============================================================

function cleanArray(
    value,
    maxItems = 20
) {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .filter(
            item =>
                typeof item === "string"
        )
        .map(
            item =>
                cleanText(item, 500)
        )
        .filter(Boolean)
        .slice(0, maxItems);
}

// ============================================================
// READ REPORTS
// ============================================================

function readReports() {
    try {
        const content =
            fs.readFileSync(
                REPORTS_FILE,
                "utf8"
            );

        const reports =
            JSON.parse(content);

        return Array.isArray(reports)
            ? reports
            : [];

    } catch (error) {

        console.error(
            "Unable to read reports:",
            error
        );

        return [];
    }
}

// ============================================================
// SAVE REPORTS
// ============================================================

function saveReports(reports) {

    fs.writeFileSync(
        REPORTS_FILE,
        JSON.stringify(
            reports,
            null,
            2
        ),
        "utf8"
    );
}

// ============================================================
// REPORT ID
// ============================================================

function generateReportId() {

    return (
        "CHRONIC-" +
        Date.now() +
        "-" +
        Math.floor(
            1000 +
            Math.random() * 9000
        )
    );
}

// ============================================================
// EVENT ID
// ============================================================

function generateEventId() {

    return (
        "EVT-" +
        Date.now() +
        "-" +
        Math.floor(
            Math.random() * 10000
        )
    );
}

// ============================================================
// IMAGE VALIDATION
// ============================================================

function isValidImageDataUrl(value) {

    return (
        typeof value === "string" &&
        /^data:image\/(jpeg|jpg|png|webp|gif);base64,/i.test(
            value
        )
    );
}

// ============================================================
// SLA HOURS
// ============================================================

function getSlaHours(
    severity,
    suggested
) {

    const custom =
        Number(suggested);

    if (
        Number.isFinite(custom) &&
        custom >= 1 &&
        custom <= 720
    ) {
        return custom;
    }

    const level =
        String(severity || "")
            .toLowerCase();

    if (level === "critical") {
        return 12;
    }

    if (level === "high") {
        return 24;
    }

    if (level === "medium") {
        return 48;
    }

    return 72;
}

// ============================================================
// ADD HOURS
// ============================================================

function addHours(
    date,
    hours
) {

    return new Date(
        new Date(date).getTime() +
        hours *
        60 *
        60 *
        1000
    ).toISOString();
}

// ============================================================
// AUTHORITY FALLBACK
// ============================================================

function getAuthorityFallback(
    category
) {

    const value =
        String(category || "")
            .toLowerCase();

    if (
        value.includes("road") ||
        value.includes("pothole") ||
        value.includes("street") ||
        value.includes("traffic")
    ) {

        return {

            department:
                "Road & Infrastructure Department",

            authority:
                "Municipal / Public Works Authority"
        };
    }

    if (
        value.includes("waste") ||
        value.includes("garbage") ||
        value.includes("sanitation")
    ) {

        return {

            department:
                "Waste Management Department",

            authority:
                "Municipal Sanitation Authority"
        };
    }

    if (
        value.includes("water") ||
        value.includes("drainage") ||
        value.includes("sewer")
    ) {

        return {

            department:
                "Water & Drainage Department",

            authority:
                "Municipal Water Authority"
        };
    }

    if (
        value.includes("electric") ||
        value.includes("street light") ||
        value.includes("power")
    ) {

        return {

            department:
                "Electrical Department",

            authority:
                "Municipal Electrical Authority"
        };
    }

    if (
        value.includes("park") ||
        value.includes("tree") ||
        value.includes("environment")
    ) {

        return {

            department:
                "Environment & Parks Department",

            authority:
                "Municipal Environment Authority"
        };
    }

    return {

        department:
            "Municipal Authority",

        authority:
            "Local Civic Authority"
    };
}

// ============================================================
// NORMALIZE ANALYSIS
// ============================================================

function normalizeAnalysis(
    analysis,
    location = ""
) {

    const fallback =
        getAuthorityFallback(
            analysis?.category
        );

    const severity =
        cleanText(
            analysis?.severity,
            50
        ) || "Medium";

    const slaHours =
        getSlaHours(
            severity,
            analysis?.suggestedSlaHours
        );

    return {

        problem:
            cleanText(
                analysis?.problem,
                300
            ) ||
            "Public civic issue",

        category:
            cleanText(
                analysis?.category,
                200
            ) ||
            "General Civic Issue",

        severity,

        department:
            cleanText(
                analysis?.department,
                200
            ) ||
            fallback.department,

        location:
            cleanText(
                analysis?.location,
                500
            ) ||
            location ||
            "Not provided",

        confidence:
            cleanText(
                analysis?.confidence,
                50
            ) ||
            "Medium",

        summary:
            cleanText(
                analysis?.summary,
                1500
            ) ||
            "The reported civic issue was analyzed.",

        recommendation:
            cleanText(
                analysis?.recommendation,
                1500
            ) ||
            "The responsible civic authority should review the issue.",

        objectionTitle:
            cleanText(
                analysis?.objectionTitle,
                300
            ) ||
            "Civic Complaint",

        officialComplaint:
            cleanText(
                analysis?.officialComplaint,
                3000
            ) ||
            "A civic issue has been reported for official review.",

        problemDescription:
            cleanText(
                analysis?.problemDescription,
                2500
            ) ||
            "A civic issue was reported.",

        requestedAction:
            cleanText(
                analysis?.requestedAction,
                1500
            ) ||
            "Please inspect the reported issue and take appropriate corrective action.",

        priority:
            cleanText(
                analysis?.priority,
                50
            ) ||
            severity,

        responsibleAuthority:
            cleanText(
                analysis?.responsibleAuthority,
                300
            ) ||
            fallback.authority,

        authorityReason:
            cleanText(
                analysis?.authorityReason,
                1000
            ) ||
            "Authority selected based on the civic issue category.",

        requiredEvidence:
            cleanArray(
                analysis?.requiredEvidence
            ),

        suggestedSlaHours:
            slaHours
    };
}

// ============================================================
// GEMINI AI
// ============================================================

async function callGeminiAI({
    description,
    location,
    image
}) {

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {

        throw new Error(
            "GEMINI_API_KEY is missing in .env"
        );
    }

    const model = process.env.GEMINI_MODEL || "gemini-3.5-flash";

    // ========================================================
    // SYSTEM PROMPT
    // ========================================================

    const systemPrompt = `
You are ChronicAI, an intelligent civic problem analysis assistant.

Analyze citizen civic complaints.

Input may contain:

- written description
- location
- uploaded image
- image + description

Analyze only the available evidence carefully.

Determine:

1. Actual civic problem
2. Category
3. Severity
4. Department
5. Responsible authority
6. Authority reason
7. Summary
8. Recommendation
9. Official complaint
10. Requested action
11. Required evidence
12. SLA

Do not invent facts.

Do not claim that an authority has already received the complaint.

Return ONLY valid JSON.

Use exactly this structure:

{
    "problem": "",
    "category": "",
    "severity": "Low | Medium | High | Critical",
    "department": "",
    "location": "",
    "confidence": "High | Medium | Low",
    "summary": "",
    "recommendation": "",
    "objectionTitle": "",
    "officialComplaint": "",
    "problemDescription": "",
    "requestedAction": "",
    "priority": "Low | Medium | High | Critical",
    "responsibleAuthority": "",
    "authorityReason": "",
    "requiredEvidence": [],
    "suggestedSlaHours": 48
}
`;

    // ========================================================
    // USER CONTENT
    // ========================================================

    const textPrompt = `
Citizen Description:

${description || "No description provided"}

Citizen Location:

${location || "No location provided"}

Analyze this civic report.

Return only the required JSON object.

Keep every text field concise and return no more than 5 required evidence items.
`;

    const parts = [{ text: textPrompt }];

    // ========================================================
    // IMAGE
    // ========================================================

    if (image) {

        const match = image.match(/^data:(.*?);base64,(.*)$/);
        if (!match) throw new Error("Invalid image data URL.");
        parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
    }

    // ========================================================
    // TIMEOUT
    // ========================================================

    const controller =
        new AbortController();

    const timeout =
        setTimeout(
            () => {
                controller.abort();
            },
            45000
        );

    try {

        console.log("");
        console.log(
            "========== GEMINI REQUEST =========="
        );

        console.log(
            "Model:",
            model
        );

        console.log(
            "API Key:",
            apiKey
                ? "FOUND"
                : "MISSING"
        );

        console.log(
            "Description:",
            description
                ? "YES"
                : "NO"
        );

        console.log(
            "Location:",
            location
                ? "YES"
                : "NO"
        );

        console.log(
            "Image:",
            image
                ? "YES"
                : "NO"
        );

        console.log(
            "=================================="
        );

        console.log("");

        const ai = new GoogleGenAI({ apiKey });
        const response = await Promise.race([
            ai.models.generateContent({
                model,
                contents: [{ role: "user", parts }],
                config: {
                    systemInstruction: systemPrompt,
                    temperature: 0.2,
                    maxOutputTokens: 3000,
                    responseMimeType: "application/json"
                }
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Gemini AI request timed out after 45 seconds.")), 45000))
        ]);

        const raw = response?.text;

        if (!raw) {

            console.error(
                "Unexpected Gemini response:",
                data
            );

            throw new Error(
                "Gemini returned an empty AI response."
            );
        }

        console.log(
            "Gemini AI response received successfully."
        );

        // ====================================================
        // CLEAN MODEL JSON
        // ====================================================

        let cleaned =
            String(raw).trim();

        cleaned =
            cleaned
                .replace(
                    /^```json/i,
                    ""
                )
                .replace(
                    /^```/i,
                    ""
                )
                .replace(
                    /```$/i,
                    ""
                )
                .trim();

        const firstBrace = cleaned.indexOf("{");
        const lastBrace = cleaned.lastIndexOf("}");
        if (firstBrace >= 0 && lastBrace > firstBrace) {
            cleaned = cleaned.slice(firstBrace, lastBrace + 1);
        }

        // ====================================================
        // PARSE AI JSON
        // ====================================================

        try {

            return JSON.parse(
                cleaned
            );

        } catch (error) {

            console.error("AI JSON parse error:", error);

            console.error(
                "AI raw content:",
                cleaned
            );

            throw new Error(
                "Gemini AI returned invalid JSON."
            );
        }

    } catch (error) {

        if (
            error?.name ===
            "AbortError"
        ) {

            throw new Error(
                "Gemini AI request timed out after 45 seconds."
            );
        }

        throw error;

    } finally {

        clearTimeout(
            timeout
        );
    }
}

async function callGeminiChat({ message, conversation = [] }) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is missing in .env");

    const model = process.env.GEMINI_CHAT_MODEL || "gemini-3.5-flash-lite";
    const ai = new GoogleGenAI({ apiKey });
    const history = conversation
        .slice(-8)
        .filter((item) => item?.content)
        .map((item) => `${item.role === "assistant" ? "Assistant" : "User"}: ${String(item.content).slice(0, 1200)}`)
        .join("\n");

    const response = await Promise.race([
        ai.models.generateContent({
            model,
            contents: `${history ? `${history}\n` : ""}User: ${String(message || "").slice(0, 2000)}`,
            config: {
                systemInstruction: "You are ChronicAI, a calm disaster-response assistant. Put immediate safety first. For possible danger, begin with a short urgent instruction to contact local emergency services and follow official alerts, then give clear numbered steps for the next few minutes. Prioritize evacuation, shelter, avoiding floodwater, fire, smoke, and unstable buildings, basic first aid, and communicating location and needs. Ask only essential follow-up questions such as country or current danger. Never claim to be emergency services, a doctor, or to know live conditions; say when local responders or official alerts are needed. Do not recommend risky rescues, entering water, returning to unsafe buildings, or moving seriously injured people unless there is immediate danger. For non-urgent requests, provide practical preparation checklists and a simple plan. Keep answers concise, action-oriented, empathetic, and easy to follow under stress.",
                temperature: 0.6,
                maxOutputTokens: 600
            }
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Gemini response timed out. Please try again.")), 20000))
    ]);

    const answer = response?.text?.trim();
    if (!answer) throw new Error("Gemini returned an empty chat response.");
    return answer;
}

// ============================================================
// HEALTH CHECK
// ============================================================

app.get("/health", (req, res) => {
    const memory = process.memoryUsage();
    res.status(200).json({
        success: true,
        status: "healthy",
        service: "ChronicAI",
        pid: process.pid,
        uptimeSeconds: Math.round(process.uptime()),
        rssMb: Math.round(memory.rss / 1024 / 1024),
        timestamp: new Date().toISOString()
    });
});

app.get("/api/auth/email-health", (req, res) => {
    const configuration = getOtpConfiguration();
    const ready = configuration.storageConfigured && configuration.hashSecretConfigured && (configuration.resendConfigured || configuration.brevoConfigured || configuration.smtpConfigured);
    res.status(ready ? 200 : 503).json({ success: ready, status: ready ? "ready" : "configuration_required", configuration });
});

app.get(
    "/api/health",
    (req, res) => {

        res.json({

            success: true,

            status:
                "online",

            service:
                "ChronicAI",

            aiConfigured: Boolean(process.env.GEMINI_API_KEY),

            model: process.env.GEMINI_MODEL || "gemini-3.5-flash",

            timestamp:
                new Date().toISOString()

        });
    }
);

// ============================================================
// OTP EMAIL VERIFICATION
// ============================================================

app.post("/api/auth/send-otp", async (req, res) => {
    const type = cleanText(req.body?.type, 20).toLowerCase();
    const identifier = cleanText(req.body?.identifier, 320).toLowerCase();
    if (type !== "email" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)) {
        return res.status(400).json({ success: false, error: "A valid email address is required." });
    }
    if (!allowOtpRequest(req)) {
        return res.status(429).json({ success: false, error: "Too many OTP requests. Please try again later." });
    }

    try {
        const challenge = await createOtpChallenge(type, identifier);
        try {
            await sendEmail({
                to: identifier,
                subject: "Your ChronicAI verification code",
                text: `Your ChronicAI verification code is ${challenge.otp}. It expires in 10 minutes. Never share this code.`,
                html: `<p>Your ChronicAI verification code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${challenge.otp}</p><p>This code expires in 10 minutes. Never share it.</p>`
            });
        } catch (error) {
            await discardOtpChallenge(type, identifier).catch(() => undefined);
            throw error;
        }
        return res.json({ success: true, message: "OTP sent successfully." });
    } catch (error) {
        if (error.code === "OTP_COOLDOWN") return res.status(429).json({ success: false, error: error.message, retryAfterSeconds: error.retryAfterSeconds });
        console.error("OTP send failed:", error.message);
        return res.status(503).json({ success: false, error: "Unable to send the verification email. Please try again later." });
    }
});

app.post("/api/auth/verify-otp", async (req, res) => {
    const type = cleanText(req.body?.type, 20).toLowerCase();
    const identifier = cleanText(req.body?.identifier, 320).toLowerCase();
    const otp = cleanText(req.body?.otp, 6);
    if (type !== "email" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier) || !/^\d{6}$/.test(otp)) {
        return res.status(400).json({ success: false, error: "A valid email and 6-digit OTP are required." });
    }
    try {
        const result = await verifyOtp(type, identifier, otp);
        if (!result.verified) return res.status(400).json({ success: false, verified: false, error: result.error });
        return res.json({ success: true, verified: true, verificationToken: result.verificationToken });
    } catch (error) {
        console.error("OTP verification failed:", error.message);
        return res.status(503).json({ success: false, verified: false, error: "Verification service is temporarily unavailable." });
    }
});

// ============================================================
// GEMINI TEST
// ============================================================

app.get(
    "/api/test-gemini",
    async (req, res) => {

        try {

            const apiKey =
                process.env.GEMINI_API_KEY;

            if (!apiKey) {

                return res.status(500).json({

                    success:
                        false,

                    error:
                        "GEMINI_API_KEY is missing in .env"

                });
            }

            const model =
                process.env.GEMINI_MODEL ||
                "gemini-3.5-flash";

            const response =
                await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
                    {

                        method:
                            "POST",

                        headers: {

                            "Content-Type":
                                "application/json",

                        },

                        body:
                            JSON.stringify({

                                contents: [{
                                    parts: [{
                                        text: "Reply with exactly: ChronicAI Gemini connection successful."
                                    }]
                                }],
                                generationConfig: {
                                    temperature: 0,
                                    maxOutputTokens: 50
                                }

                            })

                    }
                );

            const text =
                await response.text();

            if (!response.ok) {

                return res.status(
                    response.status
                ).json({

                    success:
                        false,

                    error:
                        "Gemini connection failed.",

                    geminiStatus:
                        response.status,

                    geminiResponse:
                        text.slice(
                            0,
                            1500
                        )

                });
            }

            let data;

            try {

                data =
                    JSON.parse(
                        text
                    );

            } catch {

                return res.status(500).json({

                    success:
                        false,

                    error:
                        "Gemini returned invalid JSON.",

                    raw:
                        text.slice(
                            0,
                            1000
                        )

                });
            }

            const message =
                data
                    ?.candidates?.[0]
                    ?.content?.parts?.[0]
                    ?.text;

            return res.json({

                success:
                    true,

                message:
                    message ||
                    "Gemini responded successfully.",

                model,

                timestamp:
                    new Date().toISOString()

            });

        } catch (error) {

            console.error(
                "GEMINI TEST ERROR:",
                error
            );

            return res.status(500).json({

                success:
                    false,

                error:
                    error?.message ||
                    "Unable to connect to Gemini."

            });
        }
    }
);

// ============================================================
// API INFORMATION
// ============================================================

app.get(
    "/api",
    (req, res) => {

        res.json({

            success:
                true,

            message:
                "ChronicAI backend API is running.",

            endpoints: {

                health:
                    "GET /api/health",

                testGemini:
                    "GET /api/test-gemini",

                analyze:
                    "POST /api/analyze",

                createReport:
                    "POST /api/reports",

                reports:
                    "GET /api/reports",

                singleReport:
                    "GET /api/reports/:reportId",

                status:
                    "PATCH /api/reports/:reportId/status",

                escalate:
                    "POST /api/reports/:reportId/escalate",

                timeline:
                    "GET /api/reports/:reportId/timeline",

                sendOtp:
                    "POST /api/auth/send-otp",

                verifyOtp:
                    "POST /api/auth/verify-otp"

            }

        });
    }
);

// ============================================================
// GOVERNMENT DASHBOARD
// ============================================================

function supportRequestText(value) {
    if (value === null || value === undefined) return "";
    if (typeof value === "object") return JSON.stringify(value, null, 2).slice(0, 12000);
    return cleanText(value, 1200);
}

function supportEmailContent(request) {
    const details = Object.entries(request.personalInfo || {}).map(([key, value]) => `${key}: ${supportRequestText(value)}`).join("\n");
    return `New Disaster Support Request\n\nRequest ID: ${request.requestId}\nSubmission date/time: ${new Date(request.submittedAt).toISOString()}\nCategory: ${request.category}\nStatus: ${request.status}\n\n${details}\n\nThis notification contains no passwords, OTPs, CVVs or card credentials.`;
}

app.post("/api/support-requests", async (req, res) => {
    try {
        const header = String(req.headers.authorization || "");
        const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
        if (!token) return res.status(401).json({ success: false, error: "Sign in is required before submitting support." });
        const decoded = await getAdminAuth(getAdminApp()).verifyIdToken(token);
        const lastSubmission = supportRequestRateLimit.get(decoded.uid) || 0;
        if (Date.now() - lastSubmission < 30000) return res.status(429).json({ success: false, error: "Please wait before submitting another support request." });
        const category = cleanText(req.body?.category, 40);
        const allowedCategories = ["financial_donation", "resource_donation", "civic_volunteer"];
        if (!allowedCategories.includes(category)) return res.status(400).json({ success: false, error: "Choose a valid support category." });
        const submittedInfo = req.body?.personalInfo && typeof req.body.personalInfo === "object" ? req.body.personalInfo : {};
        const allowedFields = ["fullName", "mobile", "alternateMobile", "email", "dobAge", "gender", "address", "city", "district", "state", "postalCode", "currentLocation", "emergencyName", "emergencyRelationship", "emergencyPhone", "donationAmount", "paymentMethod", "donationPurpose", "additionalMessage", "resourceType", "resourceName", "quantity", "availableLocation", "availability", "transportation", "capacity", "additionalDetails", "skills", "experience", "preferredRole", "availableDays", "emergencyAvailability", "vehicleAvailable", "firstAid", "languages", "travelDistance"];
        const personalInfo = Object.fromEntries(allowedFields.filter((field) => Object.prototype.hasOwnProperty.call(submittedInfo, field)).map((field) => [field, cleanText(submittedInfo[field], 1200)]));
        const fullName = cleanText(personalInfo.fullName, 150);
        const mobile = cleanText(personalInfo.mobile, 30);
        const email = cleanText(personalInfo.email, 180);
        const address = cleanText(personalInfo.address, 600);
        if (!fullName || !mobile || !email) return res.status(400).json({ success: false, error: "Name, mobile and email are required." });
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ success: false, error: "Enter a valid email address." });
        const database = getAdminDatabase(getAdminApp());
        const requestId = `DR-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
        const request = { requestId, category, userId: decoded.uid, personalInfo: { ...personalInfo, fullName, mobile, email }, status: "pending", priority: category === "civic_volunteer" ? "medium" : "normal", adminNotes: "", submittedAt: Date.now(), updatedAt: Date.now() };
        await database.ref(`supportRequests/${requestId}`).set(request);
        supportRequestRateLimit.set(decoded.uid, Date.now());
        const notificationTarget = process.env.ADMIN_NOTIFICATION_EMAIL || process.env.GOVERNMENT_ADMIN_EMAIL;
        if (notificationTarget) {
            try { await sendEmail({ to: notificationTarget, subject: `New Disaster Support Request - ${category} - ${requestId}`, text: supportEmailContent(request), html: `<pre style="font-family:Arial;white-space:pre-wrap">${supportEmailContent(request).replace(/[&<>]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[character]))}</pre>` }); }
            catch (emailError) { console.warn("Support notification email failed:", emailError.message); }
        }
        return res.status(201).json({ success: true, requestId });
    } catch (error) {
        console.error("Support request failed:", error.message);
        return res.status(500).json({ success: false, error: "Unable to submit support request." });
    }
});

app.get("/api/admin/support-requests", requireGovernmentUser, async (req, res) => {
    const snapshot = await getAdminDatabase(getAdminApp()).ref("supportRequests").once("value");
    let requests = Object.values(snapshot.val() || {});
    const query = cleanText(req.query.q, 160).toLowerCase();
    const category = cleanText(req.query.category, 50);
    const status = cleanText(req.query.status, 40);
    requests = requests.filter((item) => (!query || JSON.stringify(item).toLowerCase().includes(query)) && (!category || item.category === category) && (!status || item.status === status)).sort((a, b) => Number(b.submittedAt) - Number(a.submittedAt));
    return res.json({ success: true, requests });
});

app.patch("/api/admin/support-requests/:requestId", requireGovernmentUser, requireWriteRole, async (req, res) => {
    const requestRef = getAdminDatabase(getAdminApp()).ref(`supportRequests/${req.params.requestId}`);
    const snapshot = await requestRef.once("value");
    if (!snapshot.exists()) return res.status(404).json({ success: false, error: "Support request not found." });
    const status = cleanText(req.body?.status, 40);
    const allowedStatuses = ["pending", "under_review", "approved", "contacted", "completed", "rejected", "archived"];
    if (!allowedStatuses.includes(status)) return res.status(400).json({ success: false, error: "Invalid support request status." });
    await requestRef.update({ status, adminNotes: cleanText(req.body?.adminNotes, 2000), updatedAt: Date.now(), updatedBy: req.governmentUser.uid });
    return res.json({ success: true });
});

app.get("/api/admin/session", requireGovernmentUser, (req, res) => {
    res.json({ success: true, user: req.governmentUser });
});

app.get("/api/admin/overview", requireGovernmentUser, async (req, res) => {
    try {
        const reports = readReports();
        const query = cleanText(req.query.q, 200).toLowerCase();
        const severity = cleanText(req.query.severity, 30).toLowerCase();
        const status = cleanText(req.query.status, 40).toLowerCase();
        const type = cleanText(req.query.type, 80).toLowerCase();
        const filtered = reports.filter((report) => {
            const text = JSON.stringify(report).toLowerCase();
            return (!query || text.includes(query)) &&
                (!severity || String(report.analysis?.severity || report.priority || "").toLowerCase() === severity) &&
                (!status || String(report.status || "").toLowerCase() === status) &&
                (!type || String(report.analysis?.category || "").toLowerCase() === type);
        });
        const count = (predicate) => filtered.filter(predicate).length;
        const missingSnapshot = await getAdminDatabase(getAdminApp()).ref("missingPersons").once("value");
        const missingPersons = Object.values(missingSnapshot.val() || {});
        const supportSnapshot = await getAdminDatabase(getAdminApp()).ref("supportRequests").once("value");
        const supportRequests = Object.values(supportSnapshot.val() || {});
        const stats = {
            totalReports: filtered.length,
            activeEmergencies: count((item) => !["resolved", "closed"].includes(String(item.status).toLowerCase())),
            criticalCases: count((item) => ["critical", "severe"].includes(String(item.analysis?.severity || item.priority).toLowerCase())),
            peopleNeedingHelp: count((item) => /rescue|trapped|injur|stranded|help/i.test(JSON.stringify(item))),
            missingPersons: missingPersons.length,
            trappedPeople: count((item) => /trapped|stranded/i.test(JSON.stringify(item))),
            resourceRequests: count((item) => /food|water|medicine|shelter|resource/i.test(JSON.stringify(item))),
            damagedAssets: count((item) => /house|building|infrastructure|road|bridge|damage/i.test(JSON.stringify(item))),
            resolvedCases: count((item) => ["resolved", "closed"].includes(String(item.status).toLowerCase())),
            supportTotal: supportRequests.length,
            financialDonations: supportRequests.filter((item) => item.category === "financial_donation").length,
            resourceDonations: supportRequests.filter((item) => item.category === "resource_donation").length,
            civicVolunteers: supportRequests.filter((item) => item.category === "civic_volunteer").length,
            supportPending: supportRequests.filter((item) => item.status === "pending").length,
            supportUnderReview: supportRequests.filter((item) => item.status === "under_review").length,
            supportCompleted: supportRequests.filter((item) => item.status === "completed").length
        };
        const page = Math.max(1, Number(req.query.page) || 1);
        const pageSize = Math.min(100, Math.max(10, Number(req.query.pageSize) || 25));
        const pageReports = filtered.slice((page - 1) * pageSize, page * pageSize).map((report) => ({
            ...report,
            media: report.media?.image ? { name: report.media.name, hasImage: true } : report.media
        }));
        const locationSignals = [
            ...await Promise.all(filtered.map(async (report) => {
                const severity = String(report.analysis?.severity || report.priority || "medium");
                const reportText = JSON.stringify(report);
                const type = /critical|severe/i.test(severity)
                    ? "critical"
                    : /rescue|trapped|injur|stranded|need help|help/i.test(reportText)
                        ? "needs-help"
                        : !["resolved", "closed"].includes(String(report.status).toLowerCase())
                            ? "emergency"
                            : "report";
                const location = report.location || report.analysis?.location || "Location unavailable";
                const coordinates = report.latitude != null && report.longitude != null ? { latitude: report.latitude, longitude: report.longitude } : await geocodeLocation(location);
                return { id: report.reportId, label: report.reportId, type, title: report.analysis?.problem || report.description || "Civic report", location, status: report.status || "Submitted", severity, latitude: coordinates.latitude, longitude: coordinates.longitude };
            })),
            ...await Promise.all(missingPersons.slice(0, 100).map(async (person, index) => {
                const location = person.location || "Location unavailable";
                const coordinates = person.latitude != null && person.longitude != null ? { latitude: person.latitude, longitude: person.longitude } : await geocodeLocation(location);
                return { id: person.id || person.personId || `missing-${index + 1}`, label: `Person ${index + 1}`, type: "missing-person", title: person.name || "Missing person", location, status: person.status || "Pending", severity: "Urgent", latitude: coordinates.latitude, longitude: coordinates.longitude };
            }))
        ];
        const alerts = filtered
            .filter((item) => ["critical", "severe", "high"].includes(String(item.analysis?.severity || item.priority).toLowerCase()) && !["resolved", "closed"].includes(String(item.status).toLowerCase()))
            .slice(0, 8)
            .map((item) => ({ id: item.reportId, title: item.analysis?.problem || item.description, location: item.location, severity: item.analysis?.severity || item.priority, status: item.status, createdAt: item.createdAt }));
        return res.json({ success: true, user: req.governmentUser, stats, reports: pageReports, locationSignals, pagination: { page, pageSize, total: filtered.length, pages: Math.ceil(filtered.length / pageSize) }, missingPersons: missingPersons.slice(0, 100), alerts });
    } catch (error) {
        console.error("Government overview failed:", error.message);
        return res.status(500).json({ success: false, error: "Unable to load government dashboard data." });
    }
});

// AI CHAT
// ============================================================

app.post("/api/chat", async (req, res) => {
    try {
        const message = cleanText(req.body?.message, 4000);
        const conversation = Array.isArray(req.body?.conversation)
            ? req.body.conversation
            : [];
        if (!message) return res.status(400).json({ success: false, error: "Please enter a message." });

        const answer = await callGeminiChat({ message, conversation });
        return res.json({ success: true, answer });
    } catch (error) {
        console.error("Gemini chat error:", error);
        return res.status(502).json({ success: false, error: error?.message || "Unable to reach Gemini." });
    }
});

// AI ANALYZE
// ============================================================

app.post(
    "/api/analyze",
    async (req, res) => {

        try {

            const description =
                cleanText(
                    req.body?.description,
                    5000
                );

            const location =
                cleanText(
                    req.body?.location,
                    500
                );

            const reporterName =
                cleanText(
                    req.body?.reporterName,
                    150
                );

            const image =
                typeof req.body?.image ===
                "string"
                    ? req.body.image.trim()
                    : null;

            if (
                !description &&
                !image
            ) {

                return res.status(400).json({

                    success:
                        false,

                    error:
                        "Please provide a description or image."

                });
            }

            if (
                image &&
                !isValidImageDataUrl(
                    image
                )
            ) {

                return res.status(400).json({

                    success:
                        false,

                    error:
                        "Invalid image format."

                });
            }

            const rawAnalysis =
                await callGeminiAI({

                    description,

                    location,

                    image

                });

            const analysis =
                normalizeAnalysis(
                    rawAnalysis,
                    location
                );

            return res.json({

                success:
                    true,

                reporterName:
                    reporterName ||
                    "Anonymous",

                analysis

            });

        } catch (error) {

            console.error(
                "ANALYZE ERROR:",
                error
            );

            return res.status(500).json({

                success:
                    false,

                error:
                    error?.message ||
                    "AI analysis failed."

            });
        }
    }
);

// ============================================================
// CREATE REPORT
// ============================================================

app.post(
    "/api/reports",
    async (req, res) => {

        try {

            const reporterName =
                cleanText(
                    req.body?.reporterName,
                    150
                );

            const reporterUid =
                cleanText(
                    req.body?.reporterUid,
                    200
                );

            const description =
                cleanText(
                    req.body?.description,
                    5000
                );

            const location =
                cleanText(
                    req.body?.location,
                    500
                );

            const analysis =
                req.body?.analysis;

            if (
                !analysis ||
                typeof analysis !==
                "object"
            ) {

                return res.status(400).json({

                    success:
                        false,

                    error:
                        "AI analysis is required."

                });
            }

            if (!location) {

                return res.status(400).json({

                    success:
                        false,

                    error:
                        "Report location is required."

                });
            }

            if (typeof req.body?.image === "string" && req.body.image.length > 7 * 1024 * 1024) {
                return res.status(413).json({ success: false, error: "Attached image is too large. Use an image under 5 MB." });
            }

            const normalized =
                normalizeAnalysis(
                    analysis,
                    location
                );

            const verificationToken =
                cleanText(req.body?.verificationToken, 128);

            const verifiedContact =
                cleanText(req.body?.email || req.body?.phone, 320);

            if (verifiedContact) {
                if (!verificationToken) {
                    return res.status(403).json({ success: false, error: "Verify the contact before submitting this report." });
                }
                let tokenIsValid = false;
                try {
                    tokenIsValid = await consumeVerificationToken(verificationToken);
                } catch (error) {
                    console.error("Verification token check failed:", error.message);
                    return res.status(503).json({ success: false, error: "Verification service is temporarily unavailable." });
                }
                if (!tokenIsValid) {
                    return res.status(403).json({ success: false, error: "Verification expired. Please verify your contact again." });
                }
            }

            const reportId =
                generateReportId();

            const createdAt =
                new Date().toISOString();

            const slaHours =
                getSlaHours(
                    normalized.severity,
                    normalized.suggestedSlaHours
                );

            const slaDeadline =
                addHours(
                    createdAt,
                    slaHours
                );

            const timeline = [

                {

                    eventId:
                        generateEventId(),

                    type:
                        "SUBMITTED",

                    status:
                        "Submitted",

                    message:
                        "Citizen submitted a civic report.",

                    actor:
                        "Citizen",

                    timestamp:
                        createdAt

                },

                {

                    eventId:
                        generateEventId(),

                    type:
                        "AI_ANALYSIS",

                    status:
                        "AI Analyzed",

                    message:
                        "ChronicAI analyzed the report.",

                    actor:
                        "ChronicAI",

                    timestamp:
                        createdAt

                },

                {

                    eventId:
                        generateEventId(),

                    type:
                        "AUTHORITY_ROUTING",

                    status:
                        "Authority Recommended",

                    message:
                        `Recommended authority: ${normalized.responsibleAuthority}`,

                    actor:
                        "ChronicAI",

                    timestamp:
                        createdAt

                }

            ];

            const report = {

                reportId,

                reporterUid:
                    reporterUid ||
                    null,

                reporterName:
                    reporterName ||
                    "Anonymous",

                description,

                location,

                media: {

                    name:
                        cleanText(
                            req.body?.mediaName,
                            255
                        ),

                    image:
                        typeof req.body?.image === "string"
                            ? req.body.image
                            : null

                },

                analysis:
                    normalized,

                objection: {

                    title:
                        normalized.objectionTitle,

                    officialComplaint:
                        normalized.officialComplaint,

                    problemDescription:
                        normalized.problemDescription,

                    requestedAction:
                        normalized.requestedAction

                },

                authority: {

                    department:
                        normalized.department,

                    responsibleAuthority:
                        normalized.responsibleAuthority,

                    reason:
                        normalized.authorityReason,

                    routed:
                        false,

                    routedAt:
                        null

                },

                status:
                    "Submitted",

                priority:
                    normalized.priority,

                sla: {

                    hours:
                        slaHours,

                    deadline:
                        slaDeadline,

                    breached:
                        false,

                    breachedAt:
                        null

                },

                escalation: {

                    escalated:
                        false,

                    escalatedAt:
                        null,

                    escalatedTo:
                        null,

                    reason:
                        null

                },

                admin: {

                    assignedTo:
                        null,

                    assignedDepartment:
                        null,

                    note:
                        null,

                    updatedAt:
                        null

                },

                timeline,

                createdAt,

                updatedAt:
                    createdAt

            };

            const reports =
                readReports();

            reports.push(report);

            saveReports(reports);

            console.log(
                `New report: ${reportId}`
            );

            return res.status(201).json({

                success:
                    true,

                message:
                    "Civic report submitted successfully.",

                reportId,

                report

            });

        } catch (error) {

            console.error(
                "REPORT ERROR:",
                error
            );

            return res.status(500).json({

                success:
                    false,

                error:
                    "Unable to save report."

            });
        }
    }
);

// ============================================================
// GET ALL REPORTS
// ============================================================

app.post("/api/emergency-requests", async (req, res) => {
    try {
        const header = String(req.headers.authorization || "");
        const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
        if (!token) return res.status(401).json({ success: false, error: "Authentication required." });
        const decoded = await getAdminAuth(getAdminApp()).verifyIdToken(token);
        const latitude = Number(req.body?.latitude);
        const longitude = Number(req.body?.longitude);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return res.status(400).json({ success: false, error: "An approved location is required." });

        const database = getAdminDatabase(getAdminApp());
        const vehiclesSnapshot = await database.ref("rescueVehicles").once("value");
        const vehicles = vehiclesSnapshot.val() || {};
        const emergencyType = cleanText(req.body?.emergencyType, 80) || "Other";
        const normalizedType = emergencyType.toLowerCase();
        const preferredTypes = normalizedType.includes("medical") ? ["ambulance"] : normalizedType.includes("fire") ? ["fire"] : normalizedType.includes("police") || normalizedType.includes("security") ? ["police"] : ["rescue", "ambulance", "fire", "police"];
        const distance = (vehicle) => {
            const latDelta = (Number(vehicle.latitude) - latitude) * 111;
            const lngDelta = (Number(vehicle.longitude) - longitude) * 111 * Math.cos(latitude * Math.PI / 180);
            return Math.sqrt(latDelta ** 2 + lngDelta ** 2);
        };
        const candidates = Object.entries(vehicles).map(([vehicleId, vehicle]) => ({ vehicleId, vehicle })).filter(({ vehicle }) => vehicle && vehicle.status === "AVAILABLE" && Number.isFinite(Number(vehicle.latitude)) && Number.isFinite(Number(vehicle.longitude)) && preferredTypes.includes(String(vehicle.type || "").toLowerCase())).sort((a, b) => distance(a.vehicle) - distance(b.vehicle));
        const incidentId = `ER-${Date.now().toString(36).toUpperCase()}`;
        const assigned = candidates[0];
        const now = Date.now();
        const incident = { userId: decoded.uid, latitude, longitude, emergencyType, reportId: cleanText(req.body?.reportId, 120), assignedVehicleId: assigned?.vehicleId || "", status: assigned ? "ASSIGNED" : "PENDING", createdAt: now, updatedAt: now };
        await database.ref(`emergencyRequests/${incidentId}`).set(incident);
        if (assigned) await database.ref(`rescueVehicles/${assigned.vehicleId}`).update({ status: "ASSIGNED", incidentId, updatedAt: now });
        return res.status(201).json({ success: true, incidentId, incident });
    } catch (error) {
        console.error("Emergency request creation failed:", error.message);
        return res.status(401).json({ success: false, error: "Unable to create an authenticated emergency request." });
    }
});

app.get(
    "/api/reports",
    async (req, res) => {

        try {

            const reports =
                readReports();

            const liveReports =
                await Promise.all(
                    reports.map(
                        async report => {

                            const location =
                                report.location ||
                                report.analysis?.location ||
                                "";

                            const coordinates =
                                report.latitude != null &&
                                report.longitude != null
                                    ? {
                                        latitude:
                                            Number(report.latitude),
                                        longitude:
                                            Number(report.longitude)
                                    }
                                    : await geocodeLocation(
                                        location
                                    );

                            return {
                                ...report,
                                latitude:
                                    coordinates.latitude,
                                longitude:
                                    coordinates.longitude
                            };
                        }
                    )
                );

            return res.json({

                success:
                    true,

                count:
                    liveReports.length,

                reports
                    : liveReports

            });

        } catch (error) {

            console.error(
                error
            );

            return res.status(500).json({

                success:
                    false,

                error:
                    "Unable to load reports."

            });
        }
    }
);

// ============================================================
// GET SINGLE REPORT
// ============================================================

app.get(
    "/api/reports/:reportId",
    (req, res) => {

        const reports =
            readReports();

        const report =
            reports.find(
                item =>
                    item.reportId ===
                    req.params.reportId
            );

        if (!report) {

            return res.status(404).json({

                success:
                    false,

                error:
                    "Report not found."

            });
        }

        return res.json({

            success:
                true,

            report

        });
    }
);

// ============================================================
// UPDATE STATUS
// ============================================================

app.patch(
    "/api/reports/:reportId/status",
    requireGovernmentUser,
    requireWriteRole,
    (req, res) => {

        try {

            const allowedStatuses = [

                "Submitted",
                "Verified",
                "Assigned",
                "In Progress",
                "Resolved",
                "Rejected",
                "Escalated"

            ];

            const status =
                cleanText(
                    req.body?.status,
                    100
                );

            const adminNote =
                cleanText(
                    req.body?.adminNote,
                    2000
                );

            const assignedTo =
                cleanText(
                    req.body?.assignedTo,
                    200
                );

            const assignedDepartment =
                cleanText(
                    req.body?.assignedDepartment,
                    300
                );

            if (
                !allowedStatuses.includes(
                    status
                )
            ) {

                return res.status(400).json({

                    success:
                        false,

                    error:
                        "Invalid status."

                });
            }

            const reports =
                readReports();

            const index =
                reports.findIndex(
                    report =>
                        report.reportId ===
                        req.params.reportId
                );

            if (index === -1) {

                return res.status(404).json({

                    success:
                        false,

                    error:
                        "Report not found."

                });
            }

            const report =
                reports[index];

            const previousStatus =
                report.status;

            const now =
                new Date().toISOString();

            report.status =
                status;

            report.updatedAt =
                now;

            if (assignedTo) {

                report.admin.assignedTo =
                    assignedTo;
            }

            if (assignedDepartment) {

                report.admin.assignedDepartment =
                    assignedDepartment;
            }

            if (adminNote) {

                report.admin.note =
                    adminNote;
            }

            report.admin.updatedAt =
                now;

            if (
                status ===
                "Assigned"
            ) {

                report.authority.routed =
                    true;

                report.authority.routedAt =
                    report.authority.routedAt ||
                    now;
            }

            report.timeline.push({

                eventId:
                    generateEventId(),

                type:
                    "STATUS_UPDATE",

                status,

                previousStatus,

                message:
                    adminNote ||
                    `Status changed from ${previousStatus} to ${status}.`,

                actor:
                    req.governmentUser?.email ||
                    assignedTo ||
                    "Government official",

                timestamp:
                    now

            });

            reports[index] =
                report;

            saveReports(reports);

            return res.json({

                success:
                    true,

                message:
                    "Report status updated.",

                report

            });

        } catch (error) {

            console.error(
                error
            );

            return res.status(500).json({

                success:
                    false,

                error:
                    "Unable to update report."

            });
        }
    }
);

// ============================================================
// DELETE REPORT
// ============================================================

app.delete(
    "/api/reports/:reportId",
    requireGovernmentUser,
    requireWriteRole,
    (req, res) => {

        try {

            const reports =
                readReports();

            const index =
                reports.findIndex(
                    report =>
                        report.reportId ===
                        req.params.reportId
                );

            if (index === -1) {

                return res.status(404).json({

                    success:
                        false,

                    error:
                        "Report not found."

                });
            }

            const [removedReport] =
                reports.splice(index, 1);

            saveReports(reports);

            return res.json({

                success:
                    true,

                message:
                    "Report deleted.",

                reportId:
                    removedReport.reportId

            });

        } catch (error) {

            console.error(
                error
            );

            return res.status(500).json({

                success:
                    false,

                error:
                    "Unable to delete report."

            });
        }
    }
);

// ============================================================
// ESCALATE REPORT
// ============================================================

app.post(
    "/api/reports/:reportId/escalate",
    (req, res) => {

        try {

            const reason =
                cleanText(
                    req.body?.reason,
                    2000
                ) ||
                "Report escalated for higher authority review.";

            const escalatedTo =
                cleanText(
                    req.body?.escalatedTo,
                    300
                ) ||
                "Higher Civic Authority";

            const reports =
                readReports();

            const index =
                reports.findIndex(
                    report =>
                        report.reportId ===
                        req.params.reportId
                );

            if (index === -1) {

                return res.status(404).json({

                    success:
                        false,

                    error:
                        "Report not found."

                });
            }

            const report =
                reports[index];

            const now =
                new Date().toISOString();

            report.status =
                "Escalated";

            report.updatedAt =
                now;

            report.escalation = {

                escalated:
                    true,

                escalatedAt:
                    now,

                escalatedTo,

                reason

            };

            report.timeline.push({

                eventId:
                    generateEventId(),

                type:
                    "ESCALATION",

                status:
                    "Escalated",

                message:
                    reason,

                actor:
                    "Admin",

                timestamp:
                    now

            });

            reports[index] =
                report;

            saveReports(reports);

            return res.json({

                success:
                    true,

                message:
                    "Report escalated successfully.",

                report

            });

        } catch (error) {

            console.error(
                error
            );

            return res.status(500).json({

                success:
                    false,

                error:
                    "Unable to escalate report."

            });
        }
    }
);

// ============================================================
// TIMELINE
// ============================================================

app.get(
    "/api/reports/:reportId/timeline",
    (req, res) => {

        const reports =
            readReports();

        const report =
            reports.find(
                item =>
                    item.reportId ===
                    req.params.reportId
            );

        if (!report) {

            return res.status(404).json({

                success:
                    false,

                error:
                    "Report not found."

            });
        }

        return res.json({

            success:
                true,

            reportId:
                report.reportId,

            status:
                report.status,

            timeline:
                report.timeline || []

        });
    }
);

// ============================================================
// AUTOMATIC SLA ESCALATION
// ============================================================

function checkSlaAndEscalate() {

    try {

        const reports =
            readReports();

        let changed =
            false;

        const now =
            Date.now();

        for (
            const report of reports
        ) {

            if (
                !report?.sla?.deadline
            ) {
                continue;
            }

            if (
                report.status ===
                "Resolved" ||
                report.status ===
                "Rejected"
            ) {
                continue;
            }

            const deadline =
                new Date(
                    report.sla.deadline
                ).getTime();

            if (
                Number.isNaN(
                    deadline
                )
            ) {
                continue;
            }

            if (
                now >= deadline &&
                !report.sla.breached
            ) {

                const breachTime =
                    new Date().toISOString();

                report.sla.breached =
                    true;

                report.sla.breachedAt =
                    breachTime;

                report.status =
                    "Escalated";

                report.updatedAt =
                    breachTime;

                report.escalation = {

                    escalated:
                        true,

                    escalatedAt:
                        breachTime,

                    escalatedTo:
                        "Higher Civic Authority",

                    reason:
                        "SLA deadline exceeded without resolution."

                };

                report.timeline.push({

                    eventId:
                        generateEventId(),

                    type:
                        "SLA_BREACH",

                    status:
                        "Escalated",

                    message:
                        "SLA deadline exceeded. Report automatically escalated.",

                    actor:
                        "ChronicAI SLA System",

                    timestamp:
                        breachTime

                });

                changed =
                    true;
            }
        }

        if (changed) {

            saveReports(
                reports
            );
        }

    } catch (error) {

        console.error(
            "SLA CHECK ERROR:",
            error
        );
    }
}

// ============================================================
// SLA CHECK EVERY MINUTE
// ============================================================

setInterval(
    checkSlaAndEscalate,
    60 * 1000
);

checkSlaAndEscalate();

// ============================================================
// API 404
// IMPORTANT: This must be AFTER all API routes.
// ============================================================

app.get("/api/risk", handleRisk);

app.use(
    "/api",
    (req, res) => {

        return res.status(404).json({

            success:
                false,

            error:
                "API endpoint not found."

        });
    }
);

// ============================================================
// BLOCK PRIVATE FILES
// ============================================================

app.use(
    (req, res, next) => {

        const requestedPath =
            req.path.toLowerCase();

        const blocked =
            requestedPath ===
                "/server.js" ||

            requestedPath ===
                "/package.json" ||

            requestedPath ===
                "/package-lock.json" ||

            requestedPath ===
                "/.env" ||

            requestedPath.startsWith(
                "/data/"
            ) ||

            requestedPath.startsWith(
                "/node_modules/"
            );

        if (blocked) {

            return res
                .status(404)
                .send("Not found");
        }

        next();
    }
);

// ============================================================
// STATIC FRONTEND
// ============================================================

app.use(
    express.static(
        PUBLIC_DIR,
        {
            index:
                false,

            dotfiles:
                "ignore",

            fallthrough:
                true
        }
    )
);

// Preserve existing root-level page URLs while files live under public/html.
app.get(
    "/:page.html",
    (req, res, next) => {
        const pagePath = path.join(HTML_DIR, `${req.params.page}.html`);
        if (!fs.existsSync(pagePath)) return next();
        return res.sendFile(pagePath);
    }
);

app.get("/service-worker.js", (req, res) => res.sendFile(path.join(PUBLIC_DIR, "assets", "service-worker.js")));
app.get("/manifest.json", (req, res) => res.sendFile(path.join(PUBLIC_DIR, "assets", "manifest.json")));

// ============================================================
// ROOT
// ============================================================

app.get(
    "/",
    (req, res) => {

        return res.sendFile(
            path.join(
                HTML_DIR,
                "index.html"
            )
        );
    }
);

// ============================================================
// INDEX
// ============================================================

app.get(
    "/index.html",
    (req, res) => {

        return res.sendFile(
            path.join(
                HTML_DIR,
                "index.html"
            )
        );
    }
);

// ============================================================
// FRONTEND FALLBACK
// ============================================================

app.use(
    (req, res, next) => {

        const extension =
            path.extname(
                req.path
            );

        if (extension) {
            return next();
        }

        const indexPath =
            path.join(
                HTML_DIR,
                "index.html"
            );

        if (
            fs.existsSync(
                indexPath
            )
        ) {

            return res.sendFile(
                indexPath,
                error => {

                    if (error) {
                        next(error);
                    }

                }
            );
        }

        next();
    }
);

// ============================================================
// FINAL 404
// ============================================================

app.use(
    (req, res) => {

        return res
            .status(404)
            .send(
                "ChronicAI: Page not found."
            );
    }
);

// ============================================================
// GLOBAL ERROR
// ============================================================

app.use(
    (
        error,
        req,
        res,
        next
    ) => {

        console.error(
            "GLOBAL SERVER ERROR:",
            error
        );

        if (
            res.headersSent
        ) {

            return next(error);
        }

        return res.status(500).json({

            success:
                false,

            error:
                "Internal server error."

        });
    }
);

// ============================================================
// START SERVER
// ============================================================

if (process.env.CHRONICAI_LISTEN === "true") {
    app.listen(
        PORT,
        "0.0.0.0",
        () => {

            console.log("");

            console.log(
                "=========================================="
            );

            console.log(
                "          CHRONICAI BACKEND SERVER"
            );

            console.log(
                "=========================================="
            );

            console.log(
                `Server running on port: ${PORT}`
            );

            console.log(
                `Local URL: http://localhost:${PORT}`
            );

            console.log(
                `Frontend: http://localhost:${PORT}/`
            );

            console.log(
                `Health: http://localhost:${PORT}/api/health`
            );

            console.log(
                `Gemini Test: http://localhost:${PORT}/api/test-gemini`
            );

            console.log(
                `API: http://localhost:${PORT}/api`
            );

            console.log(
                `Reports: http://localhost:${PORT}/api/reports`
            );

            console.log("");

            console.log(
                "AI Analysis: ENABLED"
            );

            console.log(
                "AI Complaint Generation: ENABLED"
            );

            console.log(
                "Authority Routing: ENABLED"
            );

            console.log(
                "Admin Status Update: ENABLED"
            );

            console.log(
                "Report Timeline: ENABLED"
            );

            console.log(
                "SLA Monitoring: ENABLED"
            );

            console.log(
                "Automatic Escalation: ENABLED"
            );

            console.log("");

            console.log(
                `Frontend directory: ${PUBLIC_DIR}`
            );

            console.log(
                `index.html exists: ${
                    fs.existsSync(
                        path.join(
                            HTML_DIR,
                            "index.html"
                        )
                    )
                        ? "YES"
                        : "NO"
                }`
            );

            console.log(
                `Gemini AI Ready: ${
                    process.env.GEMINI_API_KEY
                        ? "YES"
                        : "NO"
                }`
            );

            console.log(
                "Firebase Auth: CLIENT-SIDE"
            );

            console.log(
                "Firebase Database: CLIENT-SIDE"
            );

            console.log(
                "=========================================="
            );

            console.log("");
        }
    );
} else {
    console.log(`Worker ${process.pid} started without HTTP listener (cluster health worker).`);
}

// ============================================================
// LIVE RISK OBSERVATIONS
// Open-Meteo and USGS are public sources; provider credentials
// can be added behind this boundary without changing the UI.
// ============================================================

async function fetchJsonWithTimeout(url, milliseconds = 8000, headers = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), milliseconds);

    try {
        const response = await fetch(url, { signal: controller.signal, headers });
        if (!response.ok) {
            throw new Error(`Source returned HTTP ${response.status}`);
        }
        return await response.json();
    } finally {
        clearTimeout(timeout);
    }
}

function riskBand(score) {
    if (score > 80) return "Extreme";
    if (score > 60) return "High";
    if (score > 40) return "Moderate";
    if (score > 20) return "Low";
    return "Very Low";
}

function numberOrNull(value) {
    return Number.isFinite(Number(value)) ? Number(value) : null;
}

function distanceKm(latitudeA, longitudeA, latitudeB, longitudeB) {
    const radians = value => value * Math.PI / 180;
    const deltaLatitude = radians(latitudeB - latitudeA);
    const deltaLongitude = radians(longitudeB - longitudeA);
    const a = Math.sin(deltaLatitude / 2) ** 2 + Math.cos(radians(latitudeA)) * Math.cos(radians(latitudeB)) * Math.sin(deltaLongitude / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function handleRisk(req, res) {
    const query = cleanText(req.query.q, 160);
    const latitude = numberOrNull(req.query.lat);
    const longitude = numberOrNull(req.query.lon);

    try {
        let location = query || "Current location";
        let lat = latitude;
        let lon = longitude;

        if (lat === null || lon === null) {
            if (!query) {
                return res.status(400).json({ success: false, error: "Provide q or lat/lon." });
            }
            const search = new URLSearchParams({ name: query, count: "1", language: "en", format: "json" });
            const geocode = await fetchJsonWithTimeout(`https://geocoding-api.open-meteo.com/v1/search?${search}`);
            const result = geocode.results?.[0];
            if (!result) {
                return res.status(404).json({ success: false, error: "Location not found." });
            }
            lat = result.latitude;
            lon = result.longitude;
            location = [result.name, result.admin1, result.country].filter(Boolean).join(", ");
        }

        const forecastParams = new URLSearchParams({
            latitude: String(lat), longitude: String(lon), forecast_days: "3", timezone: "auto",
            current: "temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure",
            hourly: "precipitation,precipitation_probability,wind_speed_10m,temperature_2m,relative_humidity_2m"
        });
        const [weather, earthquakes] = await Promise.all([
            fetchJsonWithTimeout(`https://api.open-meteo.com/v1/forecast?${forecastParams}`),
            fetchJsonWithTimeout(`https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&latitude=${lat}&longitude=${lon}&maxradiuskm=500&orderby=time&limit=10`)
        ]);

        const current = weather.current || {};
        const hourly = weather.hourly || {};
        const rain24 = (hourly.precipitation || []).slice(0, 24).reduce((sum, value) => sum + (Number(value) || 0), 0);
        const maxWind = Math.max(...(hourly.wind_speed_10m || []).slice(0, 24).map(Number), 0);
        const temperature = Number(current.temperature_2m) || 0;
        const pressure = Number(current.surface_pressure) || 1013;
        const earthquake = Math.max(...(earthquakes.features || []).map((item) => Number(item.properties?.mag) || 0), 0);
        const rainRisk = Math.min(48, rain24 * 1.8);
        const windRisk = Math.min(25, maxWind * 0.55);
        const heatRisk = temperature > 38 ? Math.min(20, (temperature - 34) * 5) : 0;
        const pressureRisk = pressure < 995 ? 8 : 0;
        const quakeRisk = earthquake >= 5 ? 22 : earthquake >= 4 ? 10 : 0;
        const score = Math.round(Math.min(100, rainRisk + windRisk + heatRisk + pressureRisk + quakeRisk));
        const probability = Math.round(Math.min(95, Math.max(5, score * 0.9)));
        const liveLevel = (scoreValue) => riskBand(scoreValue);
        const liveProbability = (scoreValue) => Math.round(Math.min(95, Math.max(5, scoreValue * 1.6 + 5)));
        const risks = [
            { icon: "fa-water", type: "Flood", level: liveLevel(rainRisk), probability: liveProbability(rainRisk), window: "Next 24 hours", trend: rain24 > 20 ? "Increasing" : "Stable", factors: `${rain24.toFixed(1)} mm forecast rain · live weather` },
            { icon: "fa-cloud-showers-heavy", type: "Heavy rainfall", level: liveLevel(rainRisk), probability: liveProbability(rainRisk), window: "Next 24 hours", trend: rain24 > 20 ? "Increasing" : "Stable", factors: `${rain24.toFixed(1)} mm forecast · precipitation forecast` },
            { icon: "fa-hurricane", type: "Cyclone", level: liveLevel(Math.min(100, windRisk + pressureRisk)), probability: liveProbability(windRisk + pressureRisk), window: "Next 72 hours", trend: maxWind > 40 ? "Increasing" : "Stable", factors: `Wind ${maxWind.toFixed(0)} km/h · pressure ${pressure.toFixed(0)} hPa` },
            { icon: "fa-cloud-bolt", type: "Storm", level: liveLevel(Math.min(100, rainRisk + windRisk)), probability: liveProbability(rainRisk + windRisk), window: "Next 24 hours", trend: rain24 > 20 || maxWind > 35 ? "Increasing" : "Stable", factors: `Rain ${rain24.toFixed(1)} mm · wind ${maxWind.toFixed(0)} km/h` },
            { icon: "fa-mountain", type: "Landslide", level: liveLevel(Math.min(100, rainRisk * 0.7)), probability: liveProbability(rainRisk * 0.7), window: "Next 48 hours", trend: rain24 > 30 ? "Increasing" : "Stable", factors: "Rainfall signal only; terrain and soil sensors unavailable" },
            { icon: "fa-house-crack", type: "Earthquake", level: liveLevel(quakeRisk), probability: earthquake ? liveProbability(quakeRisk) : 5, window: "No reliable forecast window", trend: earthquake >= 4 ? "Increasing" : "Stable", factors: earthquake ? `Largest recent USGS event: magnitude ${earthquake.toFixed(1)}` : "No recent USGS event above the local query threshold" },
            { icon: "fa-water", type: "Tsunami", level: "Very Low", probability: 2, window: "No reliable forecast window", trend: "Stable", factors: "No tsunami feed configured; follow official coastal warnings" },
            { icon: "fa-temperature-high", type: "Extreme heat", level: liveLevel(heatRisk), probability: liveProbability(heatRisk), window: "Next 72 hours", trend: temperature > 38 ? "Increasing" : "Stable", factors: `${temperature.toFixed(1)}°C current temperature` },
            { icon: "fa-sun", type: "Drought", level: "Data unavailable", probability: null, window: "Seasonal assessment", trend: "Stable", factors: "Requires historical rainfall and soil-moisture data" },
            { icon: "fa-fire", type: "Wildfire", level: "Data unavailable", probability: null, window: "Data unavailable", trend: "Stable", factors: "Requires vegetation and fire-weather provider data" },
            { icon: "fa-bolt", type: "Lightning", level: rainRisk > 20 ? "Moderate" : "Low", probability: rainRisk > 20 ? 35 : 10, window: "Next 24 hours", trend: rainRisk > 20 ? "Increasing" : "Stable", factors: "Rainfall proxy; lightning feed unavailable" },
            { icon: "fa-wind", type: "Severe wind", level: liveLevel(windRisk), probability: liveProbability(windRisk), window: "Next 24 hours", trend: maxWind > 35 ? "Increasing" : "Stable", factors: `${maxWind.toFixed(0)} km/h maximum forecast wind` },
            { icon: "fa-circle-question", type: "Other hazards", level: "Data unavailable", probability: null, window: "Data unavailable", trend: "Stable", factors: "No configured provider for this hazard type" }
        ];

        const radiusKm = Math.min(100, Math.max(10, Number(req.query.radius) || 50));
        const situations = [];
        const addWeatherSignal = (type, icon, severity, threshold, factors, duration) => {
            if (threshold) {
                situations.push({ type, icon, status: "Active weather signal", severity, distanceKm: 0, affectedArea: location, latitude: lat, longitude: lon, startTime: weather.current?.time || new Date().toISOString(), duration, risk: factors, source: "Open-Meteo" });
            }
        };
        addWeatherSignal("Flood watch", "fa-water", rain24 >= 30 ? "High" : "Moderate", rain24 >= 10, `${rain24.toFixed(1)} mm rain forecast in 24 hours`, "Next 24 hours");
        addWeatherSignal("Heavy rain", "fa-cloud-showers-heavy", rain24 >= 30 ? "High" : "Moderate", rain24 >= 10, `${rain24.toFixed(1)} mm rain forecast in 24 hours`, "Next 24 hours");
        addWeatherSignal("Severe wind", "fa-wind", maxWind >= 60 ? "Severe" : "High", maxWind >= 45, `${maxWind.toFixed(0)} km/h maximum forecast wind`, "Next 24 hours");
        addWeatherSignal("Extreme heat", "fa-temperature-high", temperature >= 42 ? "Severe" : "High", temperature >= 38, `${temperature.toFixed(1)}°C current temperature`, "Next 72 hours");
        for (const feature of earthquakes.features || []) {
            const [eventLongitude, eventLatitude] = feature.geometry?.coordinates || [];
            const magnitude = Number(feature.properties?.mag) || 0;
            if (!Number.isFinite(eventLatitude) || !Number.isFinite(eventLongitude)) continue;
            const eventDistance = distanceKm(lat, lon, eventLatitude, eventLongitude);
            if (eventDistance > radiusKm && !(magnitude >= 5 && eventDistance <= radiusKm * 1.25)) continue;
            situations.push({ type: "Earthquake", icon: "fa-house-crack", status: "Reported event", severity: magnitude >= 6 ? "Severe" : magnitude >= 5 ? "High" : magnitude >= 4 ? "Moderate" : "Low", distanceKm: Number(eventDistance.toFixed(1)), affectedArea: feature.properties?.place || "Nearby area", latitude: eventLatitude, longitude: eventLongitude, startTime: feature.properties?.time ? new Date(feature.properties.time).toISOString() : null, duration: "Event monitoring", risk: `Magnitude ${magnitude.toFixed(1)} · USGS event`, source: "USGS Earthquakes" });
        }
        situations.sort((first, second) => second.severity.localeCompare(first.severity) || first.distanceKm - second.distanceKm);
        res.json({ success: true, mode: "live", location, coordinates: { latitude: lat, longitude: lon }, radiusKm, score, confidence: 70, level: riskBand(score), summary: situations.length ? `${situations.length} nearby situation signal${situations.length === 1 ? "" : "s"} detected within ${radiusKm} km.` : `No significant disaster signals detected within ${radiusKm} km.`, weather: { temperature, humidity: current.relative_humidity_2m ?? null, windSpeed: current.wind_speed_10m ?? null, pressure, precipitation: current.precipitation ?? null }, risks, situations, alerts: [], sources: [{ name: "Open-Meteo", updatedAt: weather.current?.time || null }, { name: "USGS Earthquakes", updatedAt: new Date().toISOString() }] });
    } catch (error) {
        console.error("Live risk provider failed:", error.message);
        res.status(503).json({ success: false, error: "Live risk data currently unavailable.", detail: "Try again shortly or follow official emergency sources." });
    }
}

if (process.env.CHRONICAI_WORKER === "true" && typeof process.send === "function") {
    const reportHealth = () => {
        const memory = process.memoryUsage();
        process.send({
            type: "health",
            pid: process.pid,
            rssMb: Math.round(memory.rss / 1024 / 1024),
            uptimeSeconds: Math.round(process.uptime())
        });
    };
    process.on("message", message => {
        if (message?.type === "health-check") reportHealth();
    });
    setInterval(reportHealth, 2000).unref();
}

function getAdminApp() {
    if (getApps().length) return getApps()[0];
    const serviceAccountFile = process.env.FIREBASE_SERVICE_ACCOUNT_FILE;
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!serviceAccountFile && !serviceAccountJson) throw new Error("Firebase Admin credentials are not configured.");
    const raw = serviceAccountFile
        ? fs.readFileSync(serviceAccountFile, "utf8")
        : serviceAccountJson;
    return initializeApp({
        credential: cert(JSON.parse(raw)),
        databaseURL: process.env.FIREBASE_DATABASE_URL
    });
}

async function requireGovernmentUser(req, res, next) {
    try {
        const remoteAddress = String(req.socket?.remoteAddress || req.ip || "").replace(/^::ffff:/, "");
        const isLocalRequest = ["127.0.0.1", "::1", "localhost"].includes(remoteAddress) || String(req.headers.host || "").startsWith("localhost") || String(req.headers.origin || "").includes("localhost");
        const isLocalAdminHeader = req.headers["x-local-admin"] === "true";
        if ((process.env.ALLOW_LOCAL_ADMIN_BYPASS === "true" || process.env.NODE_ENV !== "production") && isLocalRequest && isLocalAdminHeader) {
            req.governmentUser = { uid: "local-admin", email: "local@localhost", name: "Local administrator", role: "admin" };
            return next();
        }
        const header = String(req.headers.authorization || "");
        const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
        if (!token) return res.status(401).json({ success: false, error: "Government authentication required." });

        const decoded = await getAdminAuth(getAdminApp()).verifyIdToken(token);
        const snapshot = await getAdminDatabase(getAdminApp()).ref(`users/${decoded.uid}`).once("value");
        const profile = snapshot.val() || {};
        const role = profile.role || decoded.role;
        const allowedRoles = new Set(["admin", "super_admin", "government_officer", "rescue_coordinator", "viewer"]);
        if (!allowedRoles.has(role)) return res.status(403).json({ success: false, error: "Government access required." });

        req.governmentUser = { uid: decoded.uid, email: decoded.email || profile.email || "", name: profile.name || decoded.name || "Government user", role };
        return next();
    } catch (error) {
        console.error("Government authentication failed:", error.message);
        return res.status(401).json({ success: false, error: "Invalid or expired government session." });
    }
}

function requireWriteRole(req, res, next) {
    if (!["admin", "super_admin", "government_officer", "rescue_coordinator"].includes(req.governmentUser?.role)) {
        return res.status(403).json({ success: false, error: "Your government role is read-only." });
    }
    return next();
}