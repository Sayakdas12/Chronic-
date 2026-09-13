# ChronicAI
It will preserve the connection(nexus) between government and people.

## Project structure

- The canonical structure is documented in [docs/PROJECT-STRUCTURE.md](docs/PROJECT-STRUCTURE.md).
- The complete product, architecture, operations, security, offline, testing, and SIH guide is documented in [docs/COMPLETE-PROJECT-DOCUMENTATION.md](docs/COMPLETE-PROJECT-DOCUMENTATION.md).
- `server/server.js` is the server entry point used by `npm start` and `npm run dev`.
- `server/firebase.js` contains the Express backend implementation.
- `public/html/` contains website pages.
- `public/css/` contains shared and page-specific styles.
- `public/js/` contains browser scripts, including the Firebase client setup.
- `public/images/`, `public/icons/`, and `public/assets/` contain frontend assets.
- `data/` contains server-managed JSON data and must not be served publicly.
- `Cronic_New/` is a legacy nested repository and is not used by the running app.
- `.env` contains server-only secrets and must never be committed or exposed to
	the browser.

Run the application from this directory with:

```text
npm start
```

## High availability

`server/server.js` starts one primary Node cluster supervisor and two identical
workers running `server/firebase.js`. The primary uses Node's round-robin
cluster scheduler as the load balancer, sends worker health checks, monitors
heartbeat and memory telemetry, and automatically replaces failed or recovered
workers. The existing application remains on port `3000`.

Operational settings are environment variables:

- `PORT` changes the shared application port.
- `HA_WORKERS` controls the worker count and defaults to `2` (primary plus two
	workers gives the requested three processes).
- `HA_HEARTBEAT_MS`, `HA_HEARTBEAT_TIMEOUT_MS`, and `HA_MAX_RSS_MB` tune health
	monitoring and overload protection.

`/health` returns worker status, process id, uptime, memory usage, and a
timestamp. `/api/health` remains available for the existing application health
check.

## OTP email verification

The report verification flow uses `/api/auth/send-otp` and
`/api/auth/verify-otp`. The server tries the configured transactional provider
(`Resend` or `Brevo`) first and falls back to Nodemailer SMTP when the API is
missing or fails. OTP challenges are stored in Firebase Realtime Database via
Firebase Admin; only an HMAC hash is stored, never the six-digit code.

Configure Render environment variables from [.env.example](.env.example):

- `FIREBASE_DATABASE_URL` and `FIREBASE_SERVICE_ACCOUNT_JSON` for shared OTP
	storage across HA workers.
- `OTP_HASH_SECRET` with at least 32 random characters.
- `EMAIL_PROVIDER=auto` and either `RESEND_API_KEY` plus `RESEND_FROM`, or
	`BREVO_API_KEY` plus `BREVO_FROM`.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, and `SMTP_PASSWORD`
	for the Nodemailer fallback.

The default OTP expires after 10 minutes, allows five verification attempts,
and enforces a 60-second resend cooldown. In Render, add these values under
Service **Environment** settings; never commit `.env` or place any of these
values in `public/`.

Before using login or registration, verify the Firebase Web App configuration in
`public/js/firebase-client.js` with the Firebase
Console. Enable Email/Password Authentication and Realtime Database there.

For Missing Persons, deploy `database.rules.json` as Realtime Database Rules
and `storage.rules` as Cloud Storage Rules. Create admin access by setting a
trusted user's `/users/{uid}/role` to `admin` from a secure administrator
workflow; do not grant that role from the browser.