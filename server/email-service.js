import nodemailer from "nodemailer";

let smtpTransporter;

function providerError(provider, error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Error(`${provider} email provider failed: ${message}`);
}

function getFromAddress() {
    return process.env.RESEND_FROM || process.env.BREVO_FROM || process.env.EMAIL_FROM || process.env.EMAIL_USER;
}

async function sendWithResend(message) {
    if (!process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is not configured.");
    const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            from: process.env.RESEND_FROM || getFromAddress(),
            to: [message.to],
            subject: message.subject,
            html: message.html,
            text: message.text
        })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
}

async function sendWithBrevo(message) {
    if (!process.env.BREVO_API_KEY) throw new Error("BREVO_API_KEY is not configured.");
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
            "api-key": process.env.BREVO_API_KEY,
            "Content-Type": "application/json",
            Accept: "application/json"
        },
        body: JSON.stringify({
            sender: { email: process.env.BREVO_FROM || getFromAddress(), name: process.env.EMAIL_FROM_NAME || "ChronicAI" },
            to: [{ email: message.to }],
            subject: message.subject,
            htmlContent: message.html,
            textContent: message.text
        })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
}

function getSmtpTransporter() {
    if (smtpTransporter) return smtpTransporter;
    const user = process.env.SMTP_USER || process.env.EMAIL_USER;
    const password = process.env.SMTP_PASSWORD || process.env.EMAIL_PASSWORD;
    if (!user || !password) throw new Error("SMTP credentials are not configured.");
    smtpTransporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || "smtp.gmail.com",
        port: Number(process.env.SMTP_PORT) || 465,
        secure: String(process.env.SMTP_SECURE || "true") === "true",
        auth: { user, pass: password },
        connectionTimeout: 10000,
        socketTimeout: 10000
    });
    return smtpTransporter;
}

async function sendWithSmtp(message) {
    await getSmtpTransporter().sendMail({
        from: getFromAddress(),
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html
    });
}

export async function sendEmail(message) {
    const configured = String(process.env.EMAIL_PROVIDER || "auto").toLowerCase();
    const order = configured === "resend" ? ["resend", "smtp"] : configured === "brevo" ? ["brevo", "smtp"] : configured === "smtp" ? ["smtp"] : ["resend", "brevo", "smtp"];
    const providers = { resend: sendWithResend, brevo: sendWithBrevo, smtp: sendWithSmtp };
    const failures = [];

    for (const provider of order) {
        try {
            await providers[provider](message);
            console.info(`Email sent using ${provider}.`);
            return { provider };
        } catch (error) {
            const wrapped = providerError(provider, error);
            failures.push(wrapped.message);
            console.warn(wrapped.message);
        }
    }

    throw new Error(`No email provider succeeded. ${failures.join(" ")}`);
}
