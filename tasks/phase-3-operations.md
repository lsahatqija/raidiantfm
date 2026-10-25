# Phase 3 Security, Privacy, and Operations Contract

## Production topology

- Terminate HTTPS at the public ingress and forward only to the webplayer. The webplayer proxies `/auth` and `/api` to the private backend service.
- Set `APP_ORIGIN`, `REDIRECT_URL`, and every `CORS_ORIGINS` entry to exact HTTPS origins. Wildcards and path-bearing origins are rejected at startup.
- Set `TRUST_PROXY` to the exact number of trusted reverse-proxy hops. Do not use `true` unless every path to the service is controlled.
- Keep `COOKIE_SECURE=true` in production. MongoDB remains private and must use a least-privilege application account outside local Compose development.
- `/health` reports process liveness. `/ready` returns 200 only while Mongoose is connected; load balancers and Compose must use `/ready` for traffic/startup decisions.

## Outbound request policy

User-provided RSS sources allow HTTP and HTTPS for compatibility, but every request and redirect is DNS-resolved before use, every returned address must be globally routable, and the chosen address is pinned to the socket. Private, loopback, carrier-grade NAT, link-local/cloud metadata, documentation, multicast, and reserved IPv4/IPv6 ranges are denied. RSS responses are limited to XML feed media types, 1 MB, three redirects, a 3-second connection timeout, a 7-second read timeout, and four concurrent downloads per process.

Fixed geocoding and weather gateways are HTTPS-only, host-allowlisted, redirect-free, size limited, and timeout bounded. Spotify traffic continues through the request-scoped Spotify client.

## Personal-data inventory and retention

| Data | Purpose | Retention / deletion |
|---|---|---|
| Spotify account ID | Stable account link and ownership | Until account deletion |
| Display name / app username | User-facing identity | Until changed or account deletion |
| Encrypted Spotify credentials | Playback and Spotify API access | Until invalid grant or account deletion |
| Opaque application sessions | Authentication | 30-day absolute expiry, logout, invalid grant, or account deletion |
| City label and consent timestamp | Optional local weather | Until consent withdrawal or account deletion |
| Volume, topic subscriptions, tone | Personalization | Until changed or account deletion |
| Private topics and RSS source URLs | User-requested radio content | Until topic/account deletion |
| Per-user browser queue, recent tracks, voice, and weather units | Same-device playback continuity | Until browser storage is cleared or account deletion is completed in that browser |
| Request/security logs | Reliability and abuse investigation | Deployment owner must configure a 30-day log-sink TTL |

Spotify email and precise coordinates are not collected. An idempotent startup cleanup removes those deprecated fields from existing user records. Location is selected by the user; IP geolocation is not used. The UI states the purpose before consent and provides a removal control. The export endpoint omits sessions, credential ciphertext, hashes, and internal lease records.

`GET /api/users/me/export` returns the server-held account data; the web export control adds that user's browser-local state to the downloaded file. `DELETE /api/users/me/location` withdraws location consent. `DELETE /api/users/me` requires `{ "confirmation": "DELETE" }` and removes sessions, refresh leases, encrypted credentials with the user record, preferences/subscriptions, and owned private topics; after success the web client also removes that user's local browser keys. The deployment owner must ensure database backups expire on their normal retention schedule and cannot promise immediate erasure from immutable disaster-recovery copies; deleted data must not be restored into the live service except during a full disaster recovery.

## Rate limits and errors

Authentication routes use 10 requests per 15 minutes per hashed client bucket. Geocoding and host-blurb fetches use 30 requests per minute per authenticated user. Counters live in MongoDB with TTL indexes, so replicas share one limit. Validation failures use `422 validation_error`, oversized bodies use `413 payload_too_large`, and exhausted limits use `429 rate_limited` with `Retry-After`.

## Logs and incident handling

Every HTTP response carries `X-Request-Id`; completion, auth/session, Spotify refresh, shutdown, and external-gateway failures are JSON events. Logger field redaction covers cookies, authorization data, secrets, tokens, emails, and coordinates. Do not log request bodies or raw query strings.

If repository credentials are found outside ignored local files: revoke and rotate them first, determine which remotes/collaborators received them, then coordinate history cleanup. If personal data is exposed, preserve redacted evidence, restrict access, identify affected records and time range, and follow the applicable breach-notification process.

## Release gate

GitHub Actions performs a script-disabled frozen install from the root lockfile, registry signature verification, lint, all tests, frontend production build, Chromium mocked-auth smoke test, and a high-severity production dependency audit. Container images also install from the root lockfile with `npm ci`. A failed gate blocks release; audit deferrals require a recorded reachability assessment and review date.
