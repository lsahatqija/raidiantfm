# Phase 4 PWA operations and device checks

## Local evidence recorded on 2026-10-25

- `npm run lint`, `npm test`, and `npm run build` pass from the root workspace.
- `npm run test:e2e` covers the authenticated application in Chromium, including
  320, 768, 1024, and 1440 px screenshots, horizontal overflow, keyboard focus,
  44 x 44 px mobile targets, and serious/critical axe findings.
- `npm run test:pwa` runs the production build on the explicit loopback origin,
  validates the manifest and active worker, inspects Cache Storage for hashed
  assets and private-route exclusion, then reloads the application offline.
- Manifest and icon unit checks validate declared fields and PNG dimensions;
  the 192 px and maskable 512 px artwork was visually inspected.

## Production serving contract

The public deployment must terminate TLS and expose the webplayer, `/auth`, and
`/api` on one HTTPS origin. HTTP is acceptable only for the explicit local
loopback smoke environment. The checked-in Nginx configuration applies these
cache rules:

- `index.html`, navigation fallbacks, and `manifest.webmanifest`: revalidate.
- `service-worker.js`: `no-cache, no-store, must-revalidate` and root scope.
- hashed `/assets/`: one-year immutable caching.
- `/auth/**` and `/api/**`: proxied to the backend and always network-only in the
  service worker.

The deployment owner must verify the effective headers after the TLS ingress or
CDN, because an upstream proxy can override the container's headers.

## External smoke checks still required

- [ ] Current iOS Safari: install with Share -> Add to Home Screen, launch in
  standalone mode, verify safe areas and keyboard-driven location/search fields.
- [ ] Current Android Chrome: accept the install prompt, launch standalone, and
  verify offline/update banners and touch targets.
- [ ] Production HTTPS: confirm the manifest and worker have no mixed-content or
  scope errors and verify effective HTML/worker/manifest/asset cache headers.
- [ ] On both devices, confirm platform-limited behavior is stated honestly:
  Spotify playback and fresh radio content require connectivity.
