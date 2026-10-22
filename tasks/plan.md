# Implementation Plan: Multi-user RaidiantFM PWA

## Outcome

Turn the existing split Express/MongoDB + React/Vite application into a tenant-safe Spotify radio experience in which every request is bound to one authenticated user, Spotify credentials never cross user boundaries, and the frontend is an installable, mobile-first PWA. Deliver web-native media controls first; treat true home-screen widgets as a later native-shell capability because iOS WidgetKit and Android App Widgets cannot be shipped by a pure PWA.

## Capability Map

| Module | Responsibility | Depends on |
|---|---|---|
| `identity-session` | OAuth, application sessions, Spotify token custody, logout, tenant isolation | MongoDB, Spotify OAuth |
| `spotify-gateway` | Per-user Spotify API calls and token refresh without process-global state | `identity-session` |
| `radio-personalization` | User-owned topics, queue/profile state, RSS safety | `identity-session`, `spotify-gateway` |
| `pwa-shell` | Installability, caching, offline behavior, updates, mobile UX | stable authenticated web app |
| `system-media` | OS media metadata and lock-screen/notification controls | `spotify-gateway`, `pwa-shell` |
| `native-widgets` | Optional iOS/Android widgets and deep links | proven PWA, stable session/API contract |
| `container-platform` | Compose topology for independently replaceable webplayer, API, and MongoDB containers | root workspace lockfile, runtime configuration |

Build order: `identity-session` -> `spotify-gateway` -> `radio-personalization` -> `pwa-shell` -> `system-media` -> optional `native-widgets`.

## Container Topology

The deployable baseline is a three-service Docker Compose application:

```text
host :8080 -> webplayer (Nginx + static Vite build)
                    |-- /auth/* -> backend:3050
                    `-- /api/*  -> backend:3050
                                      |
                                      `-> db:27017 (private data network + volume)
```

- Images build from the repository root so both workspaces use the authoritative
  root `package-lock.json` with `npm ci`; nested lockfiles remain forbidden.
- MongoDB is reachable only on the private Compose data network and stores data in
  the named `mongo-data` volume. The backend joins the app and data networks; the
  webplayer joins only the app network.
- Compose waits for MongoDB health before starting the backend and for backend
  health before starting Nginx. Containers remain independently restartable and
  replaceable.
- Nginx presents one browser origin and proxies API/auth traffic, matching the
  target cookie-session architecture. Only the webplayer port binds to the host.
- Local credentials come from ignored environment files and are never copied into
  image layers. Production deployments must use their platform's secret manager,
  HTTPS ingress, a non-root application database user, and pinned/updated image
  policy.

## Current Architecture

```text
React/Vite SPA
  |-- Spotify access + refresh tokens in sessionStorage
  |-- Spotify Web Playback SDK
  |-- Web Speech API
  `-- Bearer token attached to most API requests
              |
              v
Express API (single Node process)
  |-- one module-global spotify-web-api-node instance
  |-- one global refresh interval and token cache
  |-- OAuth callback posts raw tokens to the browser
  |-- user/profile/topic/radio endpoints
  `-- MongoDB: users (including raw Spotify tokens) + topics
```

The data model is already per Spotify user, but the execution model is not: the singleton Spotify client is mutable shared state. Database separation therefore does not provide request isolation.

## Findings

### Critical: authentication and tenant isolation

1. `raidiohost-node/src/startup/spotify.js` exports one mutable Spotify client for the entire process.
2. `raidiohost-node/src/routes/api.routes.js` calls `setAccessToken()` on that singleton for each request. Two overlapping requests can use whichever user's token was set last.
3. `auth.routes.js` also overwrites the singleton access/refresh tokens, `cachedTokenMeta`, and the sole refresh interval on every login. A new login cancels the previous user's refresh loop.
4. `/api/users/*` and `/api/radio/*` do not install the bearer-token middleware at all. Their controllers call `spotifyApi.getMe()` against the last global token.
5. `GET /auth/token` is unauthenticated and returns the process-global access token and refresh token. A non-browser client can call it without an `Origin`; CORS is not authorization.
6. The callback renders tokens into HTML, logs them, and sends them through `postMessage(..., '*')`. `/auth/tokens` also logs and returns tokens without OAuth state validation.
7. OAuth `state` is not generated or verified, leaving login CSRF/account-confusion exposure.
8. Refresh tokens are accepted from a request body, stored in browser `sessionStorage`, and stored plaintext in MongoDB. There is no application session despite `JWT_KEY` and `cookie-parser` configuration.
9. Refresh is timer-driven and process-local. It does not survive restarts or scale to multiple backend instances. An expired token restored from browser storage is not silently refreshed on mount.
10. There is no logout/revocation path. Browser-local queue, recent-track, voice, and weather keys are not user-namespaced, so sequential users on the same device inherit each other's preferences/history.

### High: security and privacy

1. `raidiohost-node/.env` was reported as tracked in the pre-consolidation repository. It is ignored and untracked in the current root, whose reachable history contains no `.env` commit, but every previously shared credential remains exposed until provider-side rotation is verified. Legacy remotes still require coordinated history cleanup if they received the file.
2. Custom RSS URLs are fetched server-side with only a scheme check. The existing TODO correctly identifies an SSRF path; redirects, private/reserved IPs, DNS rebinding, response size, and timeout are not controlled.
3. Authentication endpoints and external-fetch endpoints have no rate limiting. CORS allows hard-coded development origins, permits originless requests, and can throw if `CORS_ORIGINS` is absent.
4. IP-derived location is obtained over plain HTTP and without an explicit consent/retention design. `X-Forwarded-For` trust and `trust proxy = 2` are deployment-specific but hard-coded.
5. The API accepts several unbounded or weakly validated inputs. Errors are inconsistently mapped; validation failures can become 500 responses.
6. No structured audit trail identifies session creation, logout, refresh failure, or suspicious auth behavior. Tokens must never be included in logs.

### High: PWA and mobile gaps

1. There is no web app manifest, service worker, registration/update flow, install UI, required 192/512 icons, maskable icon, theme color, Apple touch icon, or offline fallback.
2. Nginx does not define safe cache behavior for `service-worker.js` or the manifest. Hashed assets can be immutable; the service worker and HTML must revalidate.
3. The player has no Media Session metadata/action handlers, so OS lock-screen, notification, headset, and hardware-key integration is left to browser defaults.
4. Spotify's Web Playback SDK supports major mobile browsers, but iOS requires a user interaction to begin playback and mobile background/autoplay behavior is constrained. An installed PWA does not remove those platform rules.
5. Responsive rules exist, but no evidence shows testing at 320 px, safe-area insets, standalone display mode, touch targets, virtual keyboards, or real iOS/Android playback lifecycle.
6. Web Speech synthesis is browser/OS dependent and may pause or terminate in the background. Offline mode can preserve the shell and cached metadata, but cannot truthfully promise Spotify playback, fresh RSS, or host speech without network/platform support.

### Medium: correctness and maintainability

1. Neither package has tests. The backend `npm test` script intentionally fails; the frontend has no test script.
2. Frontend lint currently reports three errors: synchronous state updates in effects in `SpotifyPlayer.jsx` and `TopicsDropdown.jsx`, plus an undefined `getProfileById` in `WebSpeechService.js`.
3. Backend syntax checks pass, but there is no lint/type/static-analysis gate.
4. Both Dockerfiles use `npm install` rather than reproducible `npm ci`; the backend includes the unnecessary `fs` registry package even though Node provides `fs`.
5. The workspace contains two independent Git repositories and a non-Git root. The frontend already has an unrelated uncommitted title change in `index.html`; implementation must preserve it.
6. Spotify's February 2026 Development Mode rules matter: new development apps are limited to five users, the app owner needs Premium, search limits are lower, and playlist response/endpoints changed. The current queue helper requests 25 search results and should be brought within the applicable quota-mode contract.

## Target Architecture

```text
Installed React PWA (same public origin as API)
  |-- httpOnly application-session cookie
  |-- no refresh token in JS-accessible storage
  |-- short-lived Spotify access token in memory only for Web Playback SDK
  |-- manifest + service worker + offline/update UI
  `-- Media Session metadata/actions
              |
              v
Express BFF / API
  |-- OAuth state transaction + secure session middleware
  |-- req.auth = { sessionId, userId, spotifyId }
  |-- per-request/per-user Spotify client
  |-- just-in-time refresh with a per-user distributed lease
  |-- authorization checks on every owned resource
  `-- SSRF-safe RSS/geocoding gateways, validation, rate limits
              |
              v
MongoDB
  |-- users and preferences
  |-- encrypted Spotify refresh/access token material
  |-- opaque, hashed, expiring sessions
  `-- OAuth transactions / refresh leases
```

### Authentication decisions

- Keep Spotify Authorization Code flow on the backend, because the backend can protect the client secret and already owns user persistence.
- Replace bearer-token-as-app-identity with an opaque application session in an `httpOnly`, `Secure`, `SameSite=Lax` cookie. Prefer serving `/api` and `/auth` through the same public origin as the PWA; this avoids fragile third-party-cookie behavior in installed/mobile contexts.
- Generate a cryptographically random OAuth `state`, store only a hash/server transaction, expire it quickly, and reject callbacks on mismatch/replay.
- Store Spotify tokens server-side, encrypted with a dedicated key separate from the cookie/session secret. Never log or render them.
- Create a Spotify client per operation/request. It may share immutable client configuration, never mutable user credentials.
- Refresh just in time when a token is near expiry. Use a Mongo-backed lease/version check so horizontally scaled instances do not overwrite rotated token material. Preserve a returned replacement refresh token; handle Spotify `invalid_grant` by ending the integration session and requiring reauthorization.
- Expose only a session-protected `GET /auth/spotify-token` endpoint for the Web Playback SDK. Return a short-lived access token and expiry, never a refresh token. The frontend keeps it in memory and the SDK callback fetches a fresh token as needed.
- Replace popup token messaging with a top-level redirect that returns to the PWA. A desktop popup may remain as an enhancement, but its completion message contains only a non-secret success signal and uses an exact configured origin.
- Add `GET /auth/session`, `POST /auth/logout`, and a consistent `401 { code: "reauth_required" }` contract.

### Per-user state decisions

- `req.auth.userId` is the sole source of ownership inside profile/radio controllers; never call Spotify `getMe()` on every protected request to rediscover identity.
- Namespace local cache keys by stable user ID or move durable preferences to the existing user document. Clear in-memory/player state on logout or account switch.
- Keep Spotify playback device IDs client-session-local. Never persist or share them across users.
- Authorize topic access as public-or-owned, including subscribe operations; reject subscriptions to another user's private topic.

### PWA caching decisions

- Precache only the versioned application shell and static local assets.
- Network-first for navigation with a small offline fallback; do not cache authenticated API responses by default.
- Network-only for `/auth/**`, user/profile/topic mutations, playback commands, Spotify APIs, and token endpoints.
- Stale-while-revalidate is acceptable only for explicitly public topic catalogue data after responses are separated from user-specific data.
- Never put Spotify tokens, session responses, email/profile PII, private playlist payloads, or generated user commentary in Cache Storage.
- Prompt on a waiting service worker and activate updates deliberately so a player session is not silently disrupted.

## Widget Options

| Option | Delivers | Limits | Recommendation |
|---|---|---|---|
| PWA + Media Session | Install icon, standalone launch, lock-screen/notification metadata and play/pause/seek controls where supported | Not a home-screen widget; browser/platform background limits remain | Build now |
| PWA shortcuts | Long-press launch actions such as “Open player” or “My playlists” | Static/deep-link actions, not live playback UI | Include in manifest if useful |
| Android packaged PWA/TWA + App Widget | Play Store package plus Kotlin/Glance widget | Native Android project and signed releases; widget cannot host the running web player | Consider only for Android-first validation |
| Capacitor/native shell + WidgetKit + Glance | Cross-platform store apps, true iOS/Android widgets, deep links, secure native storage | Highest build/release cost; native extensions still written separately; Spotify/background restrictions remain | Preferred route if true widgets become a product requirement |
| Pure PWA home-screen widget | None | No standards-based API lets a website publish WidgetKit/AppWidget surfaces | Do not plan around this |

The first widget should be glanceable and honest: current/last track, station status, and an “Open RaidiantFM” deep link. Direct playback from a cold widget is unreliable because the Web Playback SDK and speech engine are not running, iOS requires user activation, and credentials must not be copied into widget storage. If interactive native widgets are pursued, define a minimal authenticated snapshot/action API and have actions deep-link into the app unless a supported native playback integration is deliberately added.

## Implementation Phases

### Phase 0 — Credential containment and baseline

- Rotate Spotify client secret, MongoDB credentials, and any real `JWT_KEY` that has existed in tracked `.env`.
- Stop tracking `.env`, add `.env.example`, and decide whether repository history must be rewritten with collaborators coordinated.
- Remove every token/code log and retire `/auth/token` and `/auth/tokens` behind a migration flag or in the same release as the new session flow.
- Add test runners and capture the failing two-user scenario before changing behavior.
- Add the webplayer/backend/MongoDB Compose topology, root-lockfile Docker builds,
  private service networks, persistent database storage, and health-aware startup.

Checkpoint: no secrets in the current tree/staged diff; a test demonstrates that User A can be replaced by User B today.

### Phase 1 — Session and token foundation

- Add validated configuration, token encryption, session/OAuth-transaction models, and cookie policy.
- Implement state-bound OAuth login/callback, session lookup, logout, and reauthorization errors.
- Implement the per-user Spotify client/token service with atomic refresh coordination.
- Add auth middleware that resolves `req.auth` once and rejects unauthenticated requests before controllers.

Checkpoint: two parallel sessions remain distinct through login, refresh, restart, and logout; no endpoint returns a refresh token.

### Phase 2 — Migrate application flows

- Change all Spotify API/controller helpers to receive a request-scoped client rather than importing a singleton.
- Change profile/radio ownership to `req.auth.userId`; close private-topic authorization gaps.
- Replace frontend token storage/bearer plumbing with cookie-backed session state and a memory-only SDK token provider.
- Add account-aware cache keys and reliable logout/reset behavior.
- Update Spotify calls for the app's actual 2026 quota mode and current endpoint/field contracts.

Checkpoint: automated concurrent-user integration tests cover profile, playlists, search, queue, topics, host blurbs, playback commands, token refresh, and logout without cross-account data.

### Phase 3 — Security and operational hardening

- Add schema validation, consistent error codes, auth/external-fetch rate limits, deployment-specific proxy/CORS settings, and security event logging without PII/tokens.
- Make RSS fetching SSRF-safe with scheme/host policy, DNS/IP checks, redirect controls, timeouts, byte limits, and response content validation.
- Replace or make explicit the location consent flow; use HTTPS and document retention/deletion.
- Add health/readiness, graceful shutdown, reproducible installs, dependency audit/signature gates, and CI for lint/test/build.

Checkpoint: security abuse tests pass, no reachable critical/high dependency issue remains undocumented, and the service is safe to run with multiple instances.

### Phase 4 — Installable PWA

- Add manifest fields, icons, shortcuts, theme metadata, display mode, and install guidance for Chromium and iOS.
- Add a service worker with the cache policy above, offline shell/state, update lifecycle, and storage cleanup on version/account changes.
- Add standalone/mobile layout behavior, safe-area support, touch-friendly controls, and full loading/offline/reauth/update states.
- Configure Nginx headers/caching for HTML, manifest, service worker, immutable assets, and HTTPS deployment.

Checkpoint: installability audits pass; cold offline launch shows a useful shell; no private API/token response appears in caches; 320/768/1024/1440 layouts and keyboard/screen-reader checks pass.

### Phase 5 — System media and real-device verification

- Bind Media Session metadata, playback state, position, and supported handlers to the Spotify SDK player.
- Handle `autoplay_failed`, call `activateElement()` from a user gesture where needed, and make foreground/background transitions explicit.
- Test login, install, resume, playback, host speech, headset/lock-screen controls, token expiry, and updates on real current iOS Safari PWA and Android Chrome PWA devices.
- Record unsupported behaviors as product constraints rather than masking them.

Checkpoint: the documented mobile support matrix matches observed behavior on real devices.

### Phase 6 — Optional native widget spike

- Validate whether widget engagement justifies native distribution and choose Android-first TWA or cross-platform Capacitor/native shell.
- Prototype a read-only now-playing/station widget with deep links and no Spotify secrets.
- Only after the read-only prototype is stable, assess native interactive controls, store compliance, background behavior, and a secured widget action API.

Checkpoint: explicit go/no-go decision with measured complexity, platform behavior, and maintenance cost.

## Test Strategy

- Backend unit tests: config, encryption envelope, state validation, cookie options, token-expiry math, refresh-token rotation, URL/IP validation.
- Backend integration tests: Mongo-backed sessions and two-user concurrent requests using mocked Spotify endpoints; every protected route gets 401/403/owner tests.
- Frontend component/hook tests: auth bootstrap, reauth, logout, account switch, install/update/offline states, Media Session handlers.
- Contract tests: Spotify response mapping, especially playlists/search under Development Mode and Extended Quota Mode.
- Browser E2E: two isolated browser contexts log in as different mocked users and interleave requests; PWA install/offline/update flows; cache inspection.
- Real-device matrix: current iOS Safari installed app and Android Chrome installed app, including screen lock, app switching, headset controls, and network loss.

Proposed commands after test scaffolding:

```text
Backend lint:  npm run lint
Backend tests: npm test
Frontend lint: npm run lint
Frontend tests: npm test
Frontend build: npm run build
E2E:            npm run test:e2e
```

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Spotify Development Mode user cap blocks a public multi-user product | High | Confirm quota mode immediately; apply for/meet Extended Quota requirements before launch planning |
| Spotify tokens already exposed through Git/logs/endpoints | Critical | Rotate first, invalidate old credentials/sessions, remove leakage, coordinate history rewrite |
| Cross-origin cookies fail in installed/mobile contexts | High | Put SPA and BFF behind one HTTPS origin; avoid third-party-cookie dependency |
| Refresh races corrupt rotated credentials | High | Atomic per-user lease/version and tests with concurrent refresh requests |
| Service worker caches private responses | High | Route-denylist and automated Cache Storage assertions |
| RSS SSRF reaches internal services | High | Resolve/validate destinations, disable redirects, enforce time/size/content limits |
| iOS/background behavior cannot match a native radio app | High | Real-device spike early; set product expectations; consider native shell only with evidence |
| Web Speech voices vary or stop in background | Medium | Expose capability state and fallback behavior; evaluate server/native TTS separately if continuity is required |
| Widget scope expands into a second app architecture | Medium | Ship Media Session first; gate native widgets on a measured product decision |

## Product Decisions Needed Before Implementation

1. Deployment topology: can frontend and API be served under one HTTPS origin (recommended)?
2. Session policy: desired idle and absolute session lifetimes, and whether multiple devices/sessions per user are allowed (recommended: yes, individually revocable).
3. Spotify application status: Development Mode or Extended Quota Mode, and intended initial user count.
4. Privacy policy: retain Spotify email and precise coordinates, or minimize to Spotify ID/display name and user-selected city (recommended).
5. Offline promise: recommended wording is “the app shell and last non-sensitive UI state open offline; playback and fresh radio content require connectivity.”
6. Widget ambition: accept web-native Media Session first, or commit to native store apps after the PWA milestone.

## External Constraints Verified

- Spotify recommends Authorization Code flow for a server-backed long-running app and requires callback `state` comparison: https://developer.spotify.com/documentation/web-api/tutorials/code-flow
- Spotify access tokens expire after about one hour; current refresh tokens have a six-month lifetime and `invalid_grant` must trigger reauthorization: https://developer.spotify.com/documentation/web-api/tutorials/refreshing-tokens
- Spotify Web Playback supports major mobile browsers, but iOS playback needs user interaction: https://developer.spotify.com/documentation/web-playback-sdk
- Spotify Development Mode restrictions changed in March 2026: https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide
- PWA promotion requires a manifest and HTTPS/loopback; service workers provide the offline shell: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable
- Media Session can expose metadata and playback actions to OS controls: https://developer.mozilla.org/en-US/docs/Web/API/Navigator/mediaSession
- iOS widgets require a WidgetKit app extension: https://developer.apple.com/documentation/widgetkit/creating-a-widget-extension
- Android widgets require an app widget provider/native application component: https://developer.android.com/develop/ui/views/appwidgets

## Definition of Done

- Two or more users can use all features concurrently, across backend instances, without token, data, playback-command, cache, or preference leakage.
- OAuth state, secure application sessions, logout, refresh rotation/expiry, and reauthorization are tested.
- No refresh token is exposed to frontend JavaScript, HTML, logs, or unauthenticated endpoints; stored token material is encrypted.
- Every protected endpoint authenticates once and authorizes resource ownership.
- The app installs on supported iOS/Android browsers, launches standalone, handles offline/update/reauth states, and never caches private responses.
- Media Session behavior and mobile limitations are verified and documented on real devices.
- Lint, unit, integration, build, and E2E gates pass in CI.
- Security/privacy operations cover secret rotation, retention, export/deletion, audit logging, and incident-safe logs.

