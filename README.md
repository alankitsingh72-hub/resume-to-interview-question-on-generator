# Prepwise

Prepwise is a local AI-assisted interview preparation app. One Node.js server serves the HTML/CSS/JavaScript frontend and authenticated API at the same origin.

## Run on Windows

1. Install Node.js 20 or newer.
2. Open PowerShell in the project folder.
3. Install dependencies: `npm.cmd install`
4. For AI-powered results, copy `.env.example` to `.env` and set `OPENAI_API_KEY` to an API key you control. A key is optional for local practice.
5. Start the application: `npm.cmd start`
6. Open **http://127.0.0.1:8765**.

Keep the terminal running while using Prepwise. Do not use the Python static preview server: it does not run the API. If port 8765 is busy, set a different `PORT` in `.env`, restart, and open that port instead.

## AI configuration

Configure `OPENAI_API_KEY` and, optionally, `OPENAI_MODEL` in `.env` to enable AI-powered analysis, role matching, project drills, claim practice, answer feedback, and personalized roadmaps. Restart the server after changing the key. The default model is `gpt-4o-mini`. Keys stay on the server and are not sent to browser JavaScript.

Without a key, resume analysis, job matching, project/claim practice, mock interviews, answer feedback, question generation, and roadmap creation run in local practice mode. Results are clearly labeled, use text matching and generic practice prompts, and are not AI-generated or professional assessments. Other unsupported AI features return a clear configuration error. API timeouts, invalid AI JSON, and provider errors are surfaced explicitly; check the key, model access, and provider status.

## Features

- Account registration/login with scrypt password hashes and signed bearer tokens.
- Authenticated PDF resume upload and text extraction (maximum 10 MB; image-only scans need OCR and are rejected).
- Resume evidence review with exact resume quotes, potential interview follow-ups, and clearly marked suggestions.
- Job description/resume comparison with explainable evidence-overlap score—not an employment or hiring probability.
- Resume-based interview question generation across technical, project, experience, and HR categories.
- One-question-at-a-time mock interview with adaptive follow-ups, answer rubric, example answer structure, and end/restart controls.
- Project question tree and practice prompts for resume claims.
- Saved-question vault with search/removal, personalized roadmap tasks with completion tracking, and practice-progress indicators based only on evaluated answers.
- Responsive dashboard and profile/settings view.

## API

- `GET /api/health`
- `POST /api/register`, `POST /api/login`
- `POST /api/upload-resume` (multipart `file`)
- `GET /api/resumes/latest`
- `POST /api/generate-questions`, `GET /api/questions`
- `POST /api/resume/analyze`
- `POST /api/job-match`
- `POST /api/project-deep-dive`
- `POST /api/claim-practice`
- `POST /api/mock-interviews`, `POST /api/mock-interviews/:id/answer`, `POST /api/mock-interviews/:id/end`, `GET /api/mock-interviews`
- `GET/POST /api/saved-questions`, `DELETE /api/saved-questions/:id`
- `GET /api/roadmap`, `POST /api/roadmap/generate`, `PATCH /api/roadmap/:id`
- `GET /api/progress`

All personal-data APIs require `Authorization: Bearer <token>`. Use the frontend to sign in; it stores the token in browser local storage.

## Local data and privacy

The lightweight local development store lives in `.data/` and contains accounts, uploaded resume text/files, questions, evaluations, saved items, and roadmap tasks. Existing store fields and records are preserved; newer maps are added without resetting the file. Do not commit `.data/`, `.env`, or real API keys.

This JSON-file store and local HTTP server are for a single-machine development setup, not production deployment. Before public deployment, replace the store with a transactional database, add HTTPS, rate limiting, secure session/token policies, backups, deletion/retention controls, and a reviewed privacy policy. A readiness score is only an informal indicator derived from answer evaluations; it is not a probability of getting hired.

## Troubleshooting

- **Could not reach the server:** confirm `npm.cmd start` is still running and use the URL printed in the terminal.
- **Want AI-personalized features:** set `OPENAI_API_KEY` in `.env`, verify that the key has API access/credits, and restart the server. Resume question generation also has a local practice-question mode when no key is configured.
- **PDF rejected:** use a readable text-based PDF under 10 MB. A scanned image PDF needs OCR first.
- **Port already in use:** stop the other local server or set a different `PORT` in `.env`.
- **Install scripts blocked in PowerShell:** use `npm.cmd` instead of `npm`.

Run integration checks with `npm.cmd test`.

## Current scope

Browser speech input/output, a graphical question-tree canvas, interview-date scheduling, and production-database migrations are not included. The interactive question tree, text-only interview mode, and editable task completion are available without these optional features. AI-dependent flows require external API credentials and are not claimed to have been live-provider tested without them.
