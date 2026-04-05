# DevLog AI Frontend

React dashboard scaffold for teammate 2. It ships with mock data by default so the demo UI can be built before Firebase and the FastAPI backend are live.

## Quick start

1. Copy `.env.example` to `.env`.
2. Set `VITE_USE_MOCK_DATA=true` for local UI work, or add Firebase + API values and flip it to `false`.
3. Run `npm install`.
4. Run `npm run dev`.

## Current assumptions

- `devlog/current` is a Firestore document whose markdown lives under `content`, `markdown`, or `projectMd`.
- `status/current` is the document used for the shared `status.json` schema.
- `changes`, `decisions`, `snapshots`, and `todos` are top-level collections ordered by `timestamp` or `updatedAt`.
- `/query`, `/handoff`, and `/restore` exist on the backend once the FastAPI service is ready.
