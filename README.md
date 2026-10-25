# RaidiantFM

RaidiantFM combines a user's Spotify music with spoken, personalized RSS topics to recreate a personal radio-station experience.

## Workspace

This is a single npm and Git monorepo:

- `raidiohost-node/` — Express/MongoDB API and Spotify integration
- `raidiohost-webplayer/` — React/Vite web player
- `tasks/` — architecture plans and implementation checklists

The root `package-lock.json` is the authoritative dependency lockfile.

## Setup

Install every workspace from the repository root:

```powershell
npm install
```

Copy each package's documented environment variables into its local `.env`. Environment files are deliberately ignored and must never be committed.

## Development

Run the services in separate terminals:

```powershell
npm run dev:server
npm run dev:web
```

Or on Windows:

```powershell
.\start-all.ps1
```

Useful root commands:

```powershell
npm run build
npm run lint
npm test
```

## Spotify development

All Spotify API work must follow [AGENTS.md](./AGENTS.md), the official Spotify OpenAPI schema, current authorization guidance, and the Spotify Developer Terms.

Set `SPOTIFY_QUOTA_MODE=development` unless Spotify has approved the configured
Client ID for Extended Quota Mode. Development Mode requires a Premium app owner,
supports at most five allowlisted users, caps search results at 10, and restricts
playlist-item reads to owned or collaborative playlists. See
[Phase 2 State and Spotify Operations](./tasks/phase-2-operations.md) for the
browser-retention contract and authorized sandbox smoke procedure.

Production security, privacy retention/deletion, readiness, proxy/CORS, logging,
and incident requirements are documented in
[Phase 3 Security, Privacy, and Operations](./tasks/phase-3-operations.md).

