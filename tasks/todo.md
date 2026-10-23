# Multi-user RaidiantFM PWA Task List

Implementation is intentionally gated on approval of `tasks/plan.md` and the product decisions listed there.

## Phase 0: Containment and executable baseline

### Task 1: Rotate and untrack repository secrets

**Description:** Rotate all credentials that appeared in the tracked backend `.env`, remove the file from Git tracking without deleting the developer's local copy, and add a placeholder-only environment example.

**Acceptance criteria:**
- [ ] Spotify secret, MongoDB credential, and session/encryption secrets are newly issued.
- [x] `.env` is ignored and untracked; `.env.example` contains names and safe documentation only.
- [x] A coordinated decision is recorded for Git-history cleanup if any remote/collaborator received the file.

**Verification:** `git ls-files .env` is empty; secret scan of tracked files/staged diff is clean; old credentials fail.

**Dependencies:** None. **Scope:** S. **Likely files:** backend `.gitignore`, `.env.example`, operational runbook.

### Task 2: Add test and quality scaffolding

**Description:** Establish backend unit/integration tests, frontend hook/component tests, and browser E2E with mocked Spotify so auth behavior is deterministic.

**Acceptance criteria:**
- [x] Both packages have working `lint`, `test`, and build/static-check scripts where applicable.
- [x] Mongo/Spotify test doubles and isolated environment configuration are documented.
- [x] Current frontend lint errors are fixed without behavior regressions.

**Verification:** Run both package lint/test commands and frontend production build in CI mode.

**Dependencies:** None. **Scope:** M. **Likely files:** both `package.json` files, lint/test configs, test setup files.

### Task 3: Capture the cross-user regression

**Description:** Write an integration/E2E test that interleaves User A and User B login/API calls and demonstrates the singleton-client failure before replacing it.

**Acceptance criteria:**
- [x] The test covers profile plus one Spotify data route and one radio/topic route.
- [x] It fails against the current implementation for the expected cross-user reason.
- [x] Test fixtures contain no real Spotify credentials.

**Verification:** Run the focused regression and retain the failing assertion in the task record.

**Dependencies:** Task 2. **Scope:** S. **Likely files:** backend auth integration test, Spotify mock helper.

### Task 3A: Add the distributed container baseline

**Description:** Run the webplayer, backend, and MongoDB as separate Compose
services while preserving the root npm workspace as the only installation
boundary.

**Acceptance criteria:**
- [x] Compose defines independently restartable webplayer, backend, and database containers.
- [x] MongoDB data uses a named volume and the database is not published to the host.
- [x] The webplayer proxies `/auth` and `/api` to the backend on a private network.
- [x] Builds use the root lockfile with `npm ci`; no nested lockfile is created.
- [x] Startup orders MongoDB health, backend health, then webplayer health.
- [x] Runtime credentials are injected from ignored environment files and are not copied into images.

**Verification:** `docker compose config --no-env-resolution`, clean image builds, service health, and a
request to `http://127.0.0.1:8080` plus a proxied API route.

**Dependencies:** Task 1 environment examples. **Scope:** S. **Likely files:**
`compose.yaml`, both Dockerfiles, Nginx config, `.dockerignore`, operations record.

## Checkpoint A

- [ ] Credentials are rotated/untracked and raw token logging is disabled.
- [x] Quality commands execute and the isolation bug has a reproducible test.

## Phase 1: Identity and session foundation

**Status (2026-10-23):** Phase 1 is complete on
`feature/phase-1-session-foundation`. The disposable local `raidiohost` database
was reset to remove the legacy plaintext-token user record; system topics will
be recreated by the existing startup seeder. Spotify clients and token refresh
are now request/user scoped, every private route resolves an opaque application
session, private topic ownership is enforced, and the original cross-user
regression now passes. The workspace lint, test, and production-build gate
passes with 38 backend tests and 2 frontend tests.

### Task 4: Validate runtime configuration and secrets

**Description:** Replace ad hoc environment reads with fail-fast validation and separate keys for session hashing/signing and token encryption.

**Acceptance criteria:**
- [x] Missing/malformed config produces a clear startup error with no secret values.
- [x] origin, proxy, cookie, redirect, and encryption settings are environment-specific.
- [x] production refuses insecure cookie/redirect settings.

**Verification:** Unit tests cover valid, missing, and unsafe production configurations.

**Dependencies:** Task 1, Task 2. **Scope:** S. **Likely files:** `startup/config.js`, new config module and tests, `.env.example`.

### Task 5: Add encrypted Spotify credentials and session records

**Description:** Add storage primitives for encrypted Spotify token material, opaque hashed sessions, OAuth state transactions, expiry, and refresh coordination.

**Acceptance criteria:**
- [x] Raw tokens never appear in MongoDB fields or model serialization.
- [x] Sessions have user, hash, created/last-seen/absolute expiry, and revocation fields.
- [x] OAuth transactions and refresh leases expire automatically via TTL/index strategy.

**Verification:** Model/encryption round-trip, wrong-key, expiry, serialization, and index tests pass.

**Dependencies:** Task 4. **Scope:** M. **Likely files:** user model migration, session model, OAuth transaction model, crypto service/tests.

### Task 6: Implement secure OAuth and application sessions

**Description:** Replace token-returning callback behavior with state-validated OAuth, an httpOnly session cookie, session introspection, logout, and top-level redirect completion.

**Acceptance criteria:**
- [x] State mismatch/replay/expiry is rejected and codes/tokens are never logged or rendered.
- [x] Login creates the correct user/session; logout revokes only that session and clears its cookie.
- [x] `/auth/token` and `/auth/tokens` are removed; the callback never sends secrets through `postMessage`.

**Verification:** Auth integration tests cover success, denial, state attacks, fixation, logout, cookie flags, and error sanitization.

**Dependencies:** Task 5. **Scope:** M. **Likely files:** `auth.routes.js`, auth service/middleware, session/OAuth tests.

### Task 7: Build request-scoped Spotify token/client service

**Description:** Replace the exported mutable client and timer refresh loop with per-user clients and just-in-time server refresh.

**Acceptance criteria:**
- [x] No module-global user token or refresh timer exists.
- [x] Concurrent refreshes preserve the current access and replacement refresh tokens atomically.
- [x] `invalid_grant` returns `reauth_required` and revokes affected sessions without affecting other users.

**Verification:** Unit/integration tests cover parallel users, parallel refresh, process restart, rotation, Spotify 401 retry-once, and invalid grant.

**Dependencies:** Task 5. **Scope:** M. **Likely files:** Spotify factory, token service, user service/model, focused tests.

### Task 8: Apply authentication and ownership middleware

**Description:** Resolve a session once per request and require it on all private Spotify, user, radio, geocoding, and playback routes.

**Acceptance criteria:**
- [x] Unauthenticated requests consistently return 401; forbidden ownership returns 403.
- [x] Controllers use `req.auth.userId` and do not rediscover the user through mutable Spotify state.
- [x] Private topics cannot be viewed/subscribed/modified by another user.

**Verification:** Route matrix tests cover missing/expired/revoked sessions and cross-owner IDs.

**Dependencies:** Task 6, Task 7. **Scope:** M. **Likely files:** route modules, auth middleware, user/radio controllers, route tests.

## Checkpoint B

- [x] Two server-side sessions remain independent under interleaved and concurrent requests.
- [x] No refresh token reaches the browser, logs, HTML, or API responses.
- [x] The original cross-user regression test passes.

## Phase 2: Product-flow migration

### Task 9: Migrate Spotify API helpers to scoped clients

**Description:** Pass a request/user-scoped Spotify client through search, recommendation, playlist, queue, and playback paths.

**Acceptance criteria:**
- [ ] No application code imports a mutable Spotify singleton.
- [ ] Every Spotify operation identifies its session/user explicitly.
- [ ] Spotify errors map to stable API error codes without token leakage.

**Verification:** Parallel-user contract tests cover every Spotify-backed endpoint.

**Dependencies:** Task 7, Task 8. **Scope:** M. **Likely files:** API route/controller/functions, Spotify gateway, tests.

### Task 10: Add Web Playback SDK token broker

**Description:** Add a session-protected endpoint returning only a short-lived access token and make the player SDK request it on demand.

**Acceptance criteria:**
- [ ] Endpoint requires the application cookie and returns no refresh token.
- [ ] Browser stores the SDK access token in memory only.
- [ ] Refresh/reauthorization errors move the UI into an explicit sign-in state.

**Verification:** Frontend hook plus backend integration tests cover token fetch, expiry, logout, and User A/User B isolation.

**Dependencies:** Task 6, Task 7. **Scope:** M. **Likely files:** auth route/service, `useAuth.js`, `SpotifyPlayer.jsx`, tests.

### Task 11: Replace frontend bearer auth with session bootstrap

**Description:** Centralize `credentials: include`, session bootstrap, 401 handling, login redirect, and logout in one frontend API/auth layer.

**Acceptance criteria:**
- [ ] `sessionStorage` contains no Spotify tokens and auth storage helpers are removed.
- [ ] Reload restores the application session; logout/account switch clears user-specific state.
- [ ] Components no longer manually compose bearer headers.

**Verification:** Hook/component tests cover initial load, expired session, reauth, logout, and network failure.

**Dependencies:** Task 6, Task 10. **Scope:** M. **Likely files:** auth hook/context, API client, token storage utility removal, focused consumers/tests.

### Task 12: Isolate browser-side user state

**Description:** Namespace or server-persist queue history, voice, weather, and other preferences and reset player/device state on account changes.

**Acceptance criteria:**
- [ ] User B never sees User A's recent/queued tracks or preferences on the same browser profile.
- [ ] Logout clears ephemeral playback/device state.
- [ ] Durable preference ownership and retention are documented.

**Verification:** Two-account frontend tests switch users in one browser context and assert clean state.

**Dependencies:** Task 11. **Scope:** M. **Likely files:** queue/speech hooks, constants/storage utility, logout integration tests.

### Task 13: Align Spotify contracts with 2026 quota mode

**Description:** Confirm Development versus Extended Quota Mode and update limits, endpoint calls, response mapping, and product messaging accordingly.

**Acceptance criteria:**
- [ ] Development Mode never requests search limits above 10 and uses current playlist contracts.
- [ ] Five-user/Premium-owner constraints are surfaced in deployment documentation when applicable.
- [ ] Extended Quota differences are configuration/contract tested, not guessed at runtime.

**Verification:** Spotify fixture contract tests and a sandbox smoke test pass for the chosen mode.

**Dependencies:** Task 9; product decision on quota mode. **Scope:** S. **Likely files:** Spotify gateway/mappers, config, tests, README/runbook.

## Checkpoint C

- [ ] Two isolated browser contexts complete profile, playlist, search, queue, topic, blurb, playback, refresh, and logout flows concurrently.
- [ ] Restarting or scaling the backend does not lose identity or mix credentials.

## Phase 3: Security, privacy, and operations

### Task 14: Harden RSS and outbound requests

**Description:** Protect custom RSS and other backend fetches from SSRF, hangs, oversized responses, and unsafe redirects.

**Acceptance criteria:**
- [ ] Private/reserved IPv4/IPv6 destinations and unsafe redirects are rejected after DNS resolution.
- [ ] Allowlisted protocols/content types, response byte cap, connect/read timeout, and concurrency cap are enforced.
- [ ] Rebinding and redirect abuse cases have tests.

**Verification:** SSRF test corpus covers loopback, RFC1918, link-local/cloud metadata, IPv6, redirects, DNS changes, timeout, and oversize feeds.

**Dependencies:** Task 8. **Scope:** M. **Likely files:** RSS service, URL safety utility, radio controller, tests.

### Task 15: Add validation, rate limits, and safe deployment policy

**Description:** Normalize request schemas/errors and make CORS, trusted proxies, cookies, and shared rate limits explicit.

**Acceptance criteria:**
- [ ] Every external input has size/type/range validation and stable 4xx errors.
- [ ] Auth and expensive external-fetch routes use a shared-store limiter for multi-instance deployments.
- [ ] Production CORS/proxy configuration is allowlisted and covered by tests.

**Verification:** Boundary/abuse tests and response-header checks pass behind the intended proxy topology.

**Dependencies:** Task 4, Task 8. **Scope:** M. **Likely files:** config/startup, validation middleware, limiter, route tests.

### Task 16: Define privacy lifecycle and location consent

**Description:** Minimize Spotify/location data and add explicit consent, retention, export, and deletion behavior.

**Acceptance criteria:**
- [ ] Each stored personal field has a purpose and retention rule; unnecessary email/precise coordinates are removed or justified.
- [ ] IP geolocation is HTTPS, deployment-safe, and opt-in—or removed in favor of user selection.
- [ ] Account export/delete removes sessions, encrypted tokens, preferences, private topics, and downstream copies.

**Verification:** Privacy integration tests exercise consent, export, delete, and post-delete authentication failure.

**Dependencies:** Task 8. **Scope:** M. **Likely files:** user model/service/controller, location UI, privacy tests/docs.

### Task 17: Add observability and release gates

**Description:** Add redacted structured logs, request IDs, health/readiness, graceful shutdown, reproducible builds, audits, and CI.

**Acceptance criteria:**
- [ ] Auth/session/refresh events are diagnosable by opaque identifiers without tokens, email, or coordinates.
- [ ] CI runs frozen install, lint, tests, build, E2E smoke, and dependency audit.
- [ ] Containers use `npm ci`; the unnecessary `fs` dependency is removed after lockfile review.

**Verification:** CI passes from clean clones; log-capture tests assert secret redaction; readiness follows Mongo connectivity.

**Dependencies:** Tasks 2, 15. **Scope:** M. **Likely files:** package/lock/Docker/CI files, logging/health modules.

## Checkpoint D

- [ ] Security abuse suite passes and production topology is documented.
- [ ] Privacy lifecycle and credential incident actions are complete.
- [ ] Clean reproducible CI is green.

## Phase 4: PWA shell

### Task 18: Add manifest, icons, and platform metadata

**Description:** Create the web app manifest and complete icon/theme metadata without overwriting the existing unrelated title edit.

**Acceptance criteria:**
- [ ] Manifest has name/short name, start URL, scope, standalone display, theme/background colors, 192/512 and maskable icons, description, and optional shortcuts.
- [ ] Apple touch icon/status-bar metadata and safe favicon fallbacks are present.
- [ ] Icons are visually verified at device sizes and maskable safe zones.

**Verification:** Browser installability inspection and manifest/icon automated checks pass.

**Dependencies:** Checkpoint D. **Scope:** S. **Likely files:** manifest, icon assets, `index.html`, Vite config.

### Task 19: Add safe service-worker caching

**Description:** Implement versioned shell precaching, navigation fallback, explicit network-only private routes, and cache cleanup.

**Acceptance criteria:**
- [ ] Cold offline launch renders a useful offline shell and cached local assets.
- [ ] Auth, Spotify, user, playlist, private topic, playback, and mutation responses never enter Cache Storage.
- [ ] Old cache versions are removed without deleting unrelated origin storage.

**Verification:** Browser tests inspect caches online/offline and assert private response exclusion.

**Dependencies:** Task 18. **Scope:** M. **Likely files:** service worker, registration module, Vite config, PWA E2E tests.

### Task 20: Build install, offline, update, and reauth UX

**Description:** Expose platform-appropriate install guidance and clear lifecycle states without interrupting active playback.

**Acceptance criteria:**
- [ ] Chromium install prompt, iOS Add to Home Screen guidance, offline state, update-ready prompt, and reauth state are accessible.
- [ ] Updates do not force-reload during playback without user consent.
- [ ] Unsupported install APIs degrade silently and accurately.

**Verification:** Component tests plus Chromium PWA E2E and manual iOS flow pass.

**Dependencies:** Task 19. **Scope:** M. **Likely files:** PWA hook/components, app shell, styles, tests.

### Task 21: Finish mobile/standalone usability

**Description:** Test and correct compact layouts, safe areas, touch targets, focus, drawers/dropdowns, and dynamic viewport behavior.

**Acceptance criteria:**
- [ ] Core flows work at 320, 768, 1024, and 1440 px with no clipped primary controls.
- [ ] Standalone mode respects notches/safe areas and mobile virtual keyboards.
- [ ] Keyboard/screen-reader paths and loading/empty/error states meet WCAG 2.1 AA expectations.

**Verification:** Responsive screenshots, keyboard pass, automated accessibility scan, and real-device smoke test.

**Dependencies:** Task 20. **Scope:** M. **Likely files:** app/player/panel components and styles, UI tests.

## Checkpoint E

- [ ] Installability, offline/privacy cache, update, responsive, and accessibility checks pass.
- [ ] PWA is served over production HTTPS with correct HTML/service-worker/asset cache headers.

## Phase 5: OS media integration

### Task 22: Integrate Media Session controls

**Description:** Publish current Spotify metadata/state/position to the OS and bind supported actions to the SDK player.

**Acceptance criteria:**
- [ ] Title, artist, album, artwork, play/pause, and position stay synchronized where supported.
- [ ] Action registration is feature-detected and cleans up on logout/unmount.
- [ ] Queue/host transitions do not expose stale metadata or duplicate actions.

**Verification:** Unit tests for bindings plus lock-screen/notification/headset checks on Android and iOS.

**Dependencies:** Task 10, Checkpoint E. **Scope:** M. **Likely files:** player component, Media Session hook, tests.

### Task 23: Handle mobile playback activation and lifecycle

**Description:** Add Spotify `autoplay_failed`, user-gesture activation, foreground/background, interruption, and reconnect states.

**Acceptance criteria:**
- [ ] iOS activation occurs from an explicit user gesture and failures produce actionable UI.
- [ ] App switching, screen locking, audio interruption, network loss, and SDK reconnect have defined behavior.
- [ ] Host TTS failure/background suspension never deadlocks music progression.

**Verification:** Real current iOS and Android device matrix is executed and recorded.

**Dependencies:** Task 22. **Scope:** M. **Likely files:** Spotify player/lifecycle hook, queue/speech coordination, device test record.

## Checkpoint F

- [ ] The real-device support matrix documents what works, degrades, and is impossible in PWA mode.
- [ ] Release candidate passes all CI, E2E, install, mobile, auth-isolation, and security checks.

## Phase 6: Optional native widgets (separate approval)

### Task 24: Run a native-container/widget feasibility spike

**Description:** Compare Android TWA plus Glance against a Capacitor/native shell plus WidgetKit/Glance using a read-only widget prototype.

**Acceptance criteria:**
- [ ] Prototype shows last/current station metadata and deep-links to the installed app without storing Spotify secrets.
- [ ] Auth handoff, refresh cadence, store requirements, background behavior, and maintenance cost are measured.
- [ ] A written go/no-go and platform choice is approved before production widget work.

**Verification:** Prototype runs on one current iPhone and Android device; threat model and estimate are reviewed.

**Dependencies:** Checkpoint F; separate product approval. **Scope:** M spike. **Likely files:** separate native shell/widget projects and architecture decision record.

