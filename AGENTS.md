# RaidiantFM Repository Guidance

## Repository layout

- `raidiohost-node/`: Express and MongoDB backend.
- `raidiohost-webplayer/`: React and Vite web player.
- `tasks/`: reviewed plans and implementation checklists.
- The root npm workspace and root `package-lock.json` are authoritative. Do not create nested lockfiles.

## Spotify integration rules

- OpenAPI contract: before adding or changing a Spotify request, inspect the official schema at https://developer.spotify.com/reference/web-api/open-api-schema.yaml. Do not guess paths, parameters, or response fields.
- Authorization: use Authorization Code with PKCE for clients that cannot keep a secret. A secure backend may use Authorization Code flow. Use Client Credentials only for public, non-user data. Never use Implicit Grant.
- Redirect URIs: use HTTPS outside local development. Local development may use an explicit loopback URI such as `http://127.0.0.1:<port>`; do not use `http://localhost` or wildcards.
- Scopes: verify scope definitions at https://developer.spotify.com/documentation/web-api/concepts/scopes and request only those required by implemented features.
- Tokens: never expose the Spotify Client Secret in frontend code. Keep refresh tokens in secure server-side storage, refresh access tokens safely, and require authorization again when refresh returns `invalid_grant` or otherwise expires.
- Rate limits: on HTTP 429, honor `Retry-After` and use bounded exponential backoff with jitter. Never retry immediately or indefinitely.
- Deprecated APIs: do not introduce deprecated endpoints. Prefer `/playlists/{id}/items` over `/playlists/{id}/tracks` and `/me/library` over type-specific library mutation endpoints.
- Errors: implement the error statuses and response shapes documented by the OpenAPI schema. Log diagnostic context without tokens or personal data, and return meaningful safe feedback to users.
- Developer terms: comply with https://developer.spotify.com/terms. Keep Spotify content only as long as needed for immediate use, retain required Spotify attribution, and never use Spotify data to train machine-learning models.
- Whenever Spotify documentation and existing code disagree, treat the current official documentation/schema as authoritative and surface the migration explicitly.

## Security boundaries

- Never commit `.env`, credentials, access tokens, refresh tokens, session identifiers, or private key material.
- Authentication is not authorization. Every protected resource must be checked against the authenticated application user.
- Never keep per-user Spotify credentials in module-global mutable state.
- Do not cache authenticated Spotify responses or user data in a service worker unless a reviewed design explicitly permits a narrowly scoped cache.

## Verification

- Run backend checks from `raidiohost-node/` and frontend checks from `raidiohost-webplayer/`.
- Run root workspace commands where available before committing.
- Preserve unrelated user changes in the working tree.

