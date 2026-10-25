# Phase 2 State and Spotify Operations

## Browser state ownership and retention

RaidiantFM stores durable browser preferences under the authenticated application
user ID, using keys shaped like `raidiohost:user:<encoded-user-id>:<setting>`.
The durable values are the queued track, recent-track history, voice name, speech
rate, speech pitch, host personality, and weather units.

- Signing out immediately hides this data but retains it for the same application
  user on that browser profile.
- Signing in as another user reads a separate namespace. Values are never copied
  between users.
- Clearing site data removes all browser-retained preferences and queue history.
- Old unscoped keys are deleted without migration because their owner cannot be
  established safely.
- Current track, Spotify device ID, in-memory playlist queue, loading state, radio
  blurbs, and articles are ephemeral and reset or become inaccessible when the
  application user changes.

Do not place access tokens, refresh tokens, session identifiers, or authenticated
Spotify response payloads in this storage namespace.

## Spotify quota mode

`SPOTIFY_QUOTA_MODE` is a deployment contract, not an automatically detected
capability. It accepts `development` or `extended` and defaults to the safer
`development` contract when omitted. Set `extended` only after Spotify has
approved that exact Client ID for Extended Quota Mode.

Development Mode behavior:

- Search requests are capped at 10 results.
- Playlist contents use `GET /playlists/{id}/items`; only playlists owned by the
  current user or playlists on which they collaborate are readable.
- The app owner must have Spotify Premium.
- At most five authenticated Spotify users may use the app, and each must be on
  the app allowlist. A non-allowlisted login may succeed while API calls return
  `403`.
- A `429` response whose reason is `QUOTA_EXCEEDED` is reported separately from a
  rolling-window rate limit. Requests honor `Retry-After` with bounded retries.

Extended Mode preserves the higher legacy search limit in the application
contract and removes the Development Mode allowlist constraint. It must not be
enabled speculatively.

Official sources checked on 2026-10-24:

- https://developer.spotify.com/reference/web-api/open-api-schema.yaml
- https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide
- https://developer.spotify.com/documentation/web-api/concepts/quota-modes
- https://developer.spotify.com/documentation/web-api/reference/get-playlists-items
- https://developer.spotify.com/documentation/web-api/reference/search

## Authorized sandbox smoke test

Use a dedicated Spotify test account and non-production Client ID. Never place
credentials or tokens in fixtures or terminal output.

1. Confirm the Client ID's App Status in Spotify's dashboard and set
   `SPOTIFY_QUOTA_MODE` to the matching value.
2. For Development Mode, confirm the app owner is Premium and add the test user
   to Users Management.
3. Start the backend and webplayer, sign in, and issue a search that requests more
   than 10 results. Development Mode must return no more than 10.
4. Open an owned or collaborative playlist and confirm its items load through the
   RaidiantFM `/api/playlist/:id/items` route.
5. In Development Mode, try a followed playlist that the user neither owns nor
   collaborates on and confirm RaidiantFM returns the safe Spotify `403` message.
6. Sign out, sign in as the second allowlisted account, and confirm the first
   account's queue, history, voice, personality, weather units, current track,
   and device state are not visible.

The deterministic test suite covers the same request and response contracts with
fixtures. The live smoke test requires an authorized Spotify sandbox and remains
a deployment-owner check because CI must not hold a personal Spotify account.
