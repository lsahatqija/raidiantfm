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

