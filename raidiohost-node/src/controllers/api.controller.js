const {
    mapTrack,
    pickRandomTracks,
    findSimilarTrack,
} = require('./api.functions');
const { createSafeHttpClient } = require('../services/outbound-http.service');

const outboundHttp = createSafeHttpClient();

function describeSpotifyFailure(error) {
    if (error?.code === 'reauth_required') {
        return { status: error.statusCode || 401, code: error.code, message: 'Spotify authorization is required' };
    }
    if (error?.code === 'spotify_refresh_unavailable') {
        return {
            status: error.statusCode || 503,
            code: error.code,
            message: 'Spotify authorization refresh is temporarily unavailable',
        };
    }

    const status = Number(error?.statusCode || error?.body?.error?.status);
    if (status === 401) {
        return { status, code: 'reauth_required', message: 'Spotify authorization is required' };
    }
    if (status === 403) {
        return { status, code: 'spotify_forbidden', message: 'Spotify denied this request' };
    }
    if (status === 429) {
        if (error?.body?.error?.reason === 'QUOTA_EXCEEDED') {
            return {
                status,
                code: 'spotify_quota_exceeded',
                message: 'Spotify request quota is temporarily exhausted',
            };
        }
        return { status, code: 'spotify_rate_limited', message: 'Spotify is temporarily rate limited' };
    }
    return { status: 502, code: 'spotify_unavailable', message: 'Spotify is temporarily unavailable' };
}

function logSpotifyFailure(req, operation, failure) {
    req.log?.warn({
        event: 'spotify_request_failed',
        operation,
        code: failure.code,
        status: failure.status,
    });
}

function respondToSpotifyFailure(res, error, operation) {
    const failure = describeSpotifyFailure(error);
    const retryAfter = Number.parseInt(error?.headers?.['retry-after'], 10);
    if (failure.status === 429 && Number.isInteger(retryAfter) && retryAfter >= 0) {
        res.set('Retry-After', String(retryAfter));
    }
    logSpotifyFailure(res.req, operation, failure);
    return res.status(failure.status).json({
        error: { code: failure.code, message: failure.message },
    });
}

async function search(req, res) {
    const q = `${req.query.q || ''}`.trim();

    if (!q) {
        return res.status(400).json({ error: 'Query is required', tracks: [] });
    }

    try {
        const limit = req.spotifyContract.clampSearchLimit(req.query.limit || 10);
        const data = await req.spotify.execute((spotifyApi) => spotifyApi.searchTracks(q, { limit }));
        const tracks = data.body.tracks.items.map(mapTrack);
        req.log?.info({ event: 'spotify_search_completed', resultCount: tracks.length });
        return res.json({ tracks });
    } catch (error) {
        return respondToSpotifyFailure(res, error, 'search');
    }
}

async function suggestions(req, res) {
    try {
        const data = await req.spotify.execute((spotifyApi) => spotifyApi.getMyTopTracks({ limit: 50 }));
        const topTracks = Array.isArray(data.body?.items) ? data.body.items : [];
        const tracks = pickRandomTracks(topTracks, 5).map(mapTrack);

        req.log?.info({ event: 'spotify_suggestions_completed', resultCount: tracks.length });
        return res.json({ tracks });
    } catch (error) {
        return respondToSpotifyFailure(res, error, 'suggestions');
    }
}

async function queueNext(req, res) {
    const trackInput = req.body?.track || req.body || {};
    const recentTracks = Array.isArray(req.body?.recentTracks) ? req.body.recentTracks : [];

    if (!trackInput?.uri && !trackInput?.id) {
        return res.json({ track: null, warning: 'Track is required for queue lookup', strategy: 'skipped' });
    }

    try {
        const { queuedTrack, matchedGenre, strategy } = await req.spotify.execute(
            (spotifyApi) => findSimilarTrack(spotifyApi, trackInput, recentTracks, {
                maxSearchLimit: req.spotifyContract.maxSearchLimit,
            }),
        );

        if (!queuedTrack) {
            return res.json({
                track: null,
                genre: matchedGenre,
                strategy,
                warning: 'No queue candidate was found, but playback can continue.',
            });
        }

        const mappedTrack = mapTrack(queuedTrack);
        req.log?.info({ event: 'spotify_queue_completed', strategy });
        return res.json({ track: mappedTrack, genre: matchedGenre, strategy });
    } catch (error) {
        const failure = describeSpotifyFailure(error);
        if (['reauth_required', 'spotify_refresh_unavailable'].includes(failure.code)) {
            return respondToSpotifyFailure(res, error, 'queue-next');
        }
        logSpotifyFailure(req, 'queue-next', failure);
        return res.json({
            track: null,
            strategy: 'error-non-blocking',
            warning: 'Queue lookup failed and was skipped.',
            error: { code: failure.code, message: failure.message },
        });
    }
}

async function playlists(req, res) {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    try {
        const { data, playlistsResult } = await req.spotify.execute(async (spotifyApi) => {
            const result = await spotifyApi.getUserPlaylists({ limit, offset });
            const playlistItems = Array.isArray(result.body?.items) ? result.body.items : [];
            const mapped = await Promise.all(playlistItems.map(async (pl) => {
            let trackCount = req.spotifyContract.getPlaylistItemTotal(pl);

            // Some playlist payloads can report an empty/partial tracks object.
            // Fallback to a lightweight playlist lookup to get items(total).
            if (trackCount <= 0 && pl?.id) {
                try {
                    const details = await spotifyApi.getPlaylist(pl.id, {
                        fields: req.spotifyContract.playlistTotalFields,
                    });
                    trackCount = req.spotifyContract.getPlaylistItemTotal(details.body) || trackCount;
                } catch (detailsErr) {
                    const failure = describeSpotifyFailure(detailsErr);
                    req.log?.warn({
                        event: 'spotify_playlist_count_failed',
                        code: failure.code,
                        status: failure.status,
                    });
                }
            }

            return {
                id: pl.id,
                name: pl.name,
                description: pl.description || '',
                imageUrl: pl.images?.[0]?.url || null,
                trackCount,
                uri: pl.uri,
                owner: pl.owner?.display_name || pl.owner?.id || 'Unknown',
                ownerId: pl.owner?.id || null,
                collaborative: pl.collaborative ?? false,
            };
            }));
            return { data: result, playlistsResult: mapped };
        });

        return res.json({ playlists: playlistsResult, total: data.body?.total ?? 0, limit, offset });
    } catch (error) {
        return respondToSpotifyFailure(res, error, 'playlists');
    }
}

async function playlistTracks(req, res) {
    const { id } = req.params;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 50);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    if (!id) {
        return res.status(400).json({ error: 'Playlist ID is required', tracks: [] });
    }

    try {
        const data = await req.spotify.execute((spotifyApi) => (
            req.spotifyContract.getPlaylistItems(spotifyApi, id, { limit, offset })
        ));
        const items = data.body?.items ?? [];
        const total = data.body?.total ?? 0;

        const tracks = items
            .filter((entry) => entry?.item?.uri)
            .map((entry) => mapTrack(entry.item));

        req.log?.info({ event: 'spotify_playlist_items_completed', resultCount: tracks.length });

        return res.json({ tracks, total, limit, offset });
    } catch (error) {
        return respondToSpotifyFailure(res, error, 'playlist-items');
    }
}

async function play(req, res) {
    const { uri, device_id } = req.query;
    const playOptions = { uris: [uri] };

    if (device_id) {
        playOptions.device_id = device_id;
    }

    try {
        await req.spotify.execute((spotifyApi) => spotifyApi.play(playOptions));
        req.log?.info({ event: 'spotify_playback_started' });
        return res.json({ ok: true, message: 'Track playing!' });
    } catch (error) {
        return respondToSpotifyFailure(res, error, 'play');
    }
}

async function geocodeCities(req, res) {
    const q = `${req.query.q || ''}`.trim();

    if (!q) {
        return res.status(400).json({ error: 'q (city name) is required' });
    }
    if (q.length > 100) {
        return res.status(400).json({ error: 'q must be 100 characters or fewer' });
    }

    try {
        const url = `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(q)}&format=json&limit=5&addressdetails=1`;
        const body = await outboundHttp.get(url, {
            allowedProtocols: ['https:'],
            allowedHosts: ['nominatim.openstreetmap.org'],
            allowedContentTypes: ['application/json'],
            connectTimeoutMs: 3_000,
            readTimeoutMs: 5_000,
            maxBytes: 250_000,
            maxRedirects: 0,
            headers: { 'User-Agent': 'AIRadioHost/1.0' },
        });
        const results = JSON.parse(body.toString('utf8'));
        if (!Array.isArray(results)) throw new Error('Unexpected geocoding response');

        const cities = results.map((item) => {
            const address = item.address || {};
            const city = address.city || address.town || address.village || address.municipality || q;
            const country = address.country || '';
            const displayName = country ? `${city}, ${country}` : city;
            return {
                displayName,
                city,
                country,
                latitude: Number.parseFloat(item.lat),
                longitude: Number.parseFloat(item.lon),
            };
        });

        return res.json(cities);
    } catch (error) {
        req.log?.warn({ event: 'geocoding_failed', errorCode: error.code || 'invalid_response' });
        return res.status(502).json({ error: { code: 'geocoding_unavailable', message: 'Geocoding service unavailable' } });
    }
}

module.exports = { search, suggestions, queueNext, playlists, playlistTracks, play, geocodeCities };
