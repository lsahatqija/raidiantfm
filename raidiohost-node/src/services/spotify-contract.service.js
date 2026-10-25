const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';
const QUOTA_MODES = new Set(['development', 'extended']);
const SEARCH_LIMITS = Object.freeze({ development: 10, extended: 50 });
const MAX_RATE_LIMIT_RETRIES = 2;

function createSpotifyError(response, body, headers) {
    const error = new Error('Spotify request failed');
    error.statusCode = response.status;
    error.body = body;
    error.headers = headers;
    return error;
}

function createSpotifyContract({
    quotaMode = 'development',
    fetch: fetchImpl = globalThis.fetch,
    wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    random = Math.random,
} = {}) {
    if (!QUOTA_MODES.has(quotaMode)) {
        throw new Error('Spotify quota mode must be development or extended');
    }

    const maxSearchLimit = SEARCH_LIMITS[quotaMode];
    const playlistTotalField = quotaMode === 'development' ? 'items' : 'tracks';
    const playlistTotalFields = `${playlistTotalField}(total)`;

    function clampSearchLimit(value) {
        const parsed = Number.parseInt(value, 10);
        return Math.min(Math.max(Number.isInteger(parsed) ? parsed : 5, 1), maxSearchLimit);
    }

    async function request(path, accessToken) {
        for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt += 1) {
            const response = await fetchImpl(`${SPOTIFY_API_BASE}${path}`, {
                headers: { Authorization: `Bearer ${accessToken}` },
            });
            const body = await response.json().catch(() => null);
            const headers = Object.fromEntries(response.headers.entries());

            if (response.ok) {
                return { body, headers, statusCode: response.status };
            }

            if (response.status !== 429 || attempt === MAX_RATE_LIMIT_RETRIES) {
                throw createSpotifyError(response, body, headers);
            }

            const retryAfterSeconds = Number.parseInt(response.headers.get('retry-after'), 10);
            const delay = Number.isInteger(retryAfterSeconds) && retryAfterSeconds >= 0
                ? retryAfterSeconds * 1000
                : (500 * (2 ** attempt)) + Math.floor(random() * 250);
            await wait(delay);
        }

        throw new Error('Spotify retry loop terminated unexpectedly');
    }

    async function getPlaylistItems(spotifyApi, playlistId, { limit = 50, offset = 0 } = {}) {
        const query = new URLSearchParams({
            limit: String(Math.min(Math.max(Number.parseInt(limit, 10) || 50, 1), 50)),
            offset: String(Math.max(Number.parseInt(offset, 10) || 0, 0)),
        });
        const path = `/playlists/${encodeURIComponent(playlistId)}/items?${query}`;
        return request(path, spotifyApi.getAccessToken());
    }

    function getPlaylistItemTotal(playlist) {
        return Number(
            playlist?.[playlistTotalField]?.total
            ?? playlist?.items?.total
            ?? playlist?.tracks?.total
            ?? 0,
        );
    }

    return {
        quotaMode,
        maxSearchLimit,
        playlistTotalFields,
        clampSearchLimit,
        getPlaylistItemTotal,
        getPlaylistItems,
    };
}

module.exports = { createSpotifyContract };
