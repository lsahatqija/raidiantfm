# Phase 0 Operations Record

## Credential incident decision

The consolidated repository currently has no tracked `.env` path and no commit in
its reachable Git history for `raidiohost-node/.env` or
`raidiohost-webplayer/.env`. The pre-consolidation repositories or remote copies
may still have received the credentials described in `tasks/plan.md`, so those
values remain compromised until their providers confirm rotation.

Decision:

1. Rotate the Spotify client secret in the Spotify developer dashboard, replace
   the local backend value, and verify the old secret can no longer exchange an
   authorization code.
2. Create a new least-privilege MongoDB application user/password, update the
   deployment secret, and remove the previous user after connectivity is proven.
3. Generate new high-entropy session/signing material. Phase 1 must use separate
   values for session integrity and token encryption rather than reusing
   `JWT_KEY`.
4. Ask every collaborator and remote owner whether a legacy repository containing
   `.env` was cloned or mirrored. If yes, coordinate a history rewrite of that
   legacy repository only after rotation, then require fresh clones. The current
   consolidated root does not need a history rewrite based on the reachable
   history inspected on 2026-10-22.

Provider-side rotation and invalidation cannot be performed from this repository.
Do not mark Task 1 complete until an owner records the rotation date and verifies
that each old credential fails.

## Local and container environment

- Copy root `.env.example` to root `.env` for Compose interpolation.
- Keep Spotify/runtime values in `raidiohost-node/.env`; Compose reads it without
  copying it into either image.
- Register `http://127.0.0.1:8080/auth/callback` as the local Spotify redirect URI
  before using the Compose stack. Production must use an exact HTTPS URI.
- Never put `CLIENT_SECRET`, MongoDB credentials, or `JWT_KEY` in the webplayer
  environment; every `VITE_*` value is compiled into browser-visible JavaScript.
- Validate Compose with `docker compose config --no-env-resolution`. The default
  rendered config expands `env_file` values and must not be written to CI logs or
  pasted into tickets.

## Test doubles

Backend integration tests replace the Spotify singleton, user service, and topic
model with deterministic in-process fakes. They never call Spotify or MongoDB and
contain no real credentials. Frontend tests use jsdom and mock hooks/browser APIs.
Browser E2E uses route interception; live Spotify OAuth is outside deterministic
CI and belongs in a separately authorized sandbox smoke test.

## Known failing regression

`raidiohost-node/test/cross-user-regression.test.js` is marked `it.fails`. It
deliberately interleaves User A's profile/topic request with User B's Spotify
search and proves that the module-global Spotify client changes User A into User
B. Vitest reports this as one expected failure. Phase 1 must remove `it.fails`
when request-scoped clients make the assertion pass.
