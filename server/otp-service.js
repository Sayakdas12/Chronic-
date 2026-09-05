import crypto from "node:crypto";
import fs from "node:fs";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";

const DEFAULT_EXPIRY_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000;
let cleanupStarted = false;

function normalizeIdentifier(identifier) {
    return String(identifier || "").trim().toLowerCase();
}

function getDatabaseInstance() {
    const serviceAccountFile = process.env.FIREBASE_SERVICE_ACCOUNT_FILE;
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if ((!serviceAccountFile && !serviceAccountJson) || !process.env.FIREBASE_DATABASE_URL) {
        throw new Error("Firebase Admin OTP storage is not configured.");
    }
    if (!getApps().length) {
        let serviceAccount;
        try {
            const raw = serviceAccountFile
                ? fs.readFileSync(serviceAccountFile, "utf8")
                : serviceAccountJson;
            serviceAccount = JSON.parse(raw);
        } catch {
            throw new Error("Firebase service-account credentials are invalid or unavailable.");
        }
        initializeApp({ credential: cert(serviceAccount), databaseURL: process.env.FIREBASE_DATABASE_URL });
    }
    return getDatabase();
}

export function getOtpConfiguration() {
    const serviceAccountConfigured = Boolean(
        (process.env.FIREBASE_SERVICE_ACCOUNT_FILE && fs.existsSync(process.env.FIREBASE_SERVICE_ACCOUNT_FILE)) ||
        (process.env.FIREBASE_SERVICE_ACCOUNT_JSON && !process.env.FIREBASE_SERVICE_ACCOUNT_JSON.includes('"project_id":"your-project"'))
    );
    const storageConfigured = serviceAccountConfigured && Boolean(process.env.FIREBASE_DATABASE_URL);
    const resendConfigured = Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM);
    const brevoConfigured = Boolean(process.env.BREVO_API_KEY && process.env.BREVO_FROM);
    const smtpConfigured = Boolean((process.env.SMTP_USER || process.env.EMAIL_USER) && (process.env.SMTP_PASSWORD || process.env.EMAIL_PASSWORD));
    return { storageConfigured, resendConfigured, brevoConfigured, smtpConfigured, hashSecretConfigured: Boolean(process.env.OTP_HASH_SECRET && process.env.OTP_HASH_SECRET.length >= 32) };
}

function getHashSecret() {
    if (!process.env.OTP_HASH_SECRET || process.env.OTP_HASH_SECRET.length < 32) {
        throw new Error("OTP_HASH_SECRET must be at least 32 characters.");
    }
    return process.env.OTP_HASH_SECRET;
}

function hashValue(value) {
    return crypto.createHmac("sha256", getHashSecret()).update(value).digest("hex");
}

function challengeKey(type, identifier) {
    return hashValue(`${type}:${normalizeIdentifier(identifier)}`);
}

function expiryMs() {
    const minutes = Math.min(10, Math.max(5, Number(process.env.OTP_EXPIRY_MINUTES) || 10));
    return minutes * 60 * 1000;
}

function startCleanup() {
    if (cleanupStarted) return;
    cleanupStarted = true;
    setInterval(async () => {
        try {
            const database = getDatabaseInstance();
            for (const collection of ["otpChallenges", "verifiedOtpTokens"]) {
                const snapshot = await database.ref(collection).orderByChild("expiresAt").endAt(Date.now()).limitToFirst(100).once("value");
                const expired = snapshot.exists() ? Object.keys(snapshot.val()) : [];
                await Promise.all(expired.map((key) => database.ref(`${collection}/${key}`).remove()));
            }
        } catch (error) {
            console.warn("OTP cleanup failed:", error.message);
        }
    }, 10 * 60 * 1000).unref();
}

export async function createOtpChallenge(type, identifier) {
    const normalized = normalizeIdentifier(identifier);
    const key = challengeKey(type, normalized);
    const database = getDatabaseInstance();
    const reference = database.ref(`otpChallenges/${key}`);
    const existing = await reference.once("value");
    const previous = existing.val();
    const now = Date.now();

    if (previous?.lastSentAt && now - previous.lastSentAt < RESEND_COOLDOWN_MS) {
        const retryAfterSeconds = Math.ceil((RESEND_COOLDOWN_MS - (now - previous.lastSentAt)) / 1000);
        const error = new Error(`Please wait ${retryAfterSeconds} seconds before requesting another OTP.`);
        error.code = "OTP_COOLDOWN";
        error.retryAfterSeconds = retryAfterSeconds;
        throw error;
    }

    const otp = String(crypto.randomInt(100000, 1000000));
    await reference.set({
        otpHash: hashValue(`${type}:${normalized}:${otp}`),
        attempts: 0,
        createdAt: now,
        lastSentAt: now,
        expiresAt: now + expiryMs()
    });
    startCleanup();
    return { key, otp, expiresAt: now + expiryMs() };
}

export async function verifyOtp(type, identifier, otp) {
    const normalized = normalizeIdentifier(identifier);
    const key = challengeKey(type, normalized);
    const database = getDatabaseInstance();
    const reference = database.ref(`otpChallenges/${key}`);
    const transaction = await reference.transaction((current) => {
        if (!current || current.expiresAt <= Date.now() || Number(current.attempts) >= MAX_ATTEMPTS) return current;
        return { ...current, attempts: Number(current.attempts || 0) + 1 };
    });
    const challenge = transaction.snapshot.val();

    if (!challenge || challenge.expiresAt <= Date.now()) {
        await reference.remove();
        return { verified: false, error: "OTP expired or not found. Request a new code." };
    }
    if (Number(challenge.attempts) >= MAX_ATTEMPTS) {
        return { verified: false, error: "Maximum OTP attempts reached. Request a new code." };
    }

    const nextAttempts = Number(challenge.attempts || 0);
    const receivedHash = hashValue(`${type}:${normalized}:${otp}`);
    const matches = crypto.timingSafeEqual(Buffer.from(receivedHash), Buffer.from(String(challenge.otpHash)));
    if (!matches) {
        return { verified: false, error: `Invalid OTP. ${Math.max(0, MAX_ATTEMPTS - nextAttempts)} attempts remaining.` };
    }

    const verificationToken = crypto.randomBytes(32).toString("hex");
    await database.ref(`verifiedOtpTokens/${hashValue(verificationToken)}`).set({ createdAt: Date.now(), expiresAt: Date.now() + expiryMs() });
    await reference.remove();
    return { verified: true, verificationToken };
}

export async function discardOtpChallenge(type, identifier) {
    const database = getDatabaseInstance();
    await database.ref(`otpChallenges/${challengeKey(type, identifier)}`).remove();
}

export async function consumeVerificationToken(token) {
    if (!token) return false;
    const database = getDatabaseInstance();
    const reference = database.ref(`verifiedOtpTokens/${hashValue(token)}`);
    const snapshot = await reference.once("value");
    const value = snapshot.val();
    if (!value || value.expiresAt <= Date.now()) {
        await reference.remove();
        return false;
    }
    await reference.remove();
    return true;
}
