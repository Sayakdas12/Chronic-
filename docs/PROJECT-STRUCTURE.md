# ChronicAI project structure

This repository contains one Node.js application. The root of the repository is
the application root; `Cronic_New/` is a legacy nested repository and is not
part of the running application.

```text
ChronicXHackathon/
|-- server/                 Node.js runtime and backend services
|   |-- server.js           Cluster supervisor and process entry point
|   |-- firebase.js         Express app, API routes, and static file serving
|   `-- *-service.js        Backend integrations
|-- public/                 Browser-served files only
|   |-- html/               Page entry points
|   |-- css/                Shared and page-specific styles
|   |-- js/                 Browser scripts and Firebase client setup
|   |-- assets/             Manifest and service worker
|   |-- images/             Page imagery
|   `-- icons/              Favicons and interface icons
|-- data/                   Server-managed data; never expose directly
|-- tests/                  Automated tests
|-- database.rules.json     Firebase Realtime Database rules
|-- storage.rules           Firebase Storage rules
|-- package.json            Scripts and dependencies
`-- .env                    Local server secrets; never commit
```

## Runtime flow

1. `npm start` runs `server/server.js`.
2. The supervisor starts workers that import `server/firebase.js`.
3. Express serves APIs and the `public/` directory.
4. Page files remain in `public/html/`; the backend preserves their existing
   root-level URLs such as `/dashboard.html`.

## Structure rules

- Put server-only code in `server/`; browser code belongs in `public/`.
- Put reusable browser behavior in `public/js/` and reusable styles in
  `public/css/global.css`.
- Keep page-specific styles and behavior named after their page.
- Do not put secrets, Firebase Admin credentials, or server-managed JSON under
  `public/`.
- Do not add application code to `Cronic_New/`; migrate it deliberately if that
  legacy repository is still needed.

## Known cleanup follow-up

Some existing pages still reference legacy names such as `report.html` and
`citizen.js`, while the current files are named `report-problem.html` and do
not include `citizen.js`. Those links should be corrected as a separate UI
cleanup so a structural change does not silently alter navigation behavior.