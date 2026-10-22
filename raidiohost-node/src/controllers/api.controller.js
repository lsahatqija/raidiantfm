const spotifyApi = require('../startup/spotify');
const {
    mapTrack,
    pickRandomTracks,
    findSimilarTrack,
} = require('./api.functions');

async function search(req, res) {
    const q = `${req.query.q || ''}`.trim();

    if (!q) {
        return res.status(400).json({ error: 'Query is required', tracks: [] });
    }

    try {
        const data = await spotifyApi.searchTracks(q, { limit: 10 });
        const tracks = data.body.tracks.items.map(mapTrack);
        console.log('Found tracks:', tracks);
        return res.json({ tracks });
    } catch (error) {
        console.error('Error searching tracks:', error);
        return res.status(500).json({ error: 'Error searching tracks', tracks: [] });
    }
}

async function suggestions(req, res) {
    try {
        const data = await spotifyApi.getMyTopTracks({ limit: 50 });
        const topTracks = Array.isArray(data.body?.items) ? data.body.items : [];
        const tracks = pickRandomTracks(topTracks, 5).map(mapTrack);

        console.log('Suggested tracks:', tracks);
        return res.json({ tracks });
    } catch (error) {
        console.error('Error fetching suggestions:', error);
        const statusCode = error?.statusCode === 401 ? 401 : 500;
        return res.status(statusCode).json({ error: 'Error fetching suggestions', tracks: [] });
    }
}

async function queueNext(req, res) {
    const trackInput = req.body?.track || req.body || {};
    const recentTracks = Array.isArray(req.body?.recentTracks) ? req.body.recentTracks : [];

    if (!trackInput?.uri && !trackInput?.id) {
        return res.json({ track: null, warning: 'Track is required for queue lookup', strategy: 'skipped' });
    }

    try {
        const { queuedTrack, matchedGenre, strategy } = await findSimilarTrack(trackInput, recentTracks);

        if (!queuedTrack) {
            return res.json({
                track: null,
                genre: matchedGenre,
                strategy,
                warning: 'No queue candidate was found, but playback can continue.',
            });
        }

        const mappedTrack = mapTrack(queuedTrack);
        console.log('Queued next track:', mappedTrack, 'strategy:', strategy);
        return res.json({ track: mappedTrack, genre: matchedGenre, strategy });
    } catch (error) {
        console.error('Error queueing next track:', error);
        return res.json({
            track: null,
            strategy: 'error-non-blocking',
            warning: 'Queue lookup failed and was skipped.',
        });
    }
}

async function playlists(req, res) {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    try {
        const data = await spotifyApi.getUserPlaylists({ limit, offset });
        const playlistItems = Array.isArray(data.body?.items) ? data.body.items : [];

        const playlistsResult = await Promise.all(playlistItems.map(async (pl) => {
            let trackCount = Number(pl?.items?.total ?? 0);

            // Some playlist payloads can report an empty/partial tracks object.
            // Fallback to a lightweight playlist lookup to get tracks(total).
            if (trackCount <= 0 && pl?.id) {
                try {
                    const details = await spotifyApi.getPlaylist(pl.id, { fields: 'tracks(total)' });
                    trackCount = Number(details.body?.items?.total ?? trackCount);
                } catch (detailsErr) {
                    console.warn(`Unable to resolve track count for playlist ${pl.id}:`, detailsErr?.message || detailsErr);
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

        return res.json({ playlists: playlistsResult, total: data.body?.total ?? 0, limit, offset });
    } catch (error) {
        console.error('Error fetching playlists:', error);
        const statusCode = error?.statusCode === 401 ? 401 : error?.statusCode === 403 ? 403 : 500;
        return res.status(statusCode).json({ error: 'Error fetching playlists', playlists: [] });
    }
}

async function playlistTracks(req, res) {
    const { id } = req.params;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 100);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    if (!id) {
        return res.status(400).json({ error: 'Playlist ID is required', tracks: [] });
    }

    try {
        const data = await spotifyApi.getPlaylist(id, { limit, offset });
        const items = data.body?.items?.items ?? [];
        const total = data.body?.items?.total ?? 0;

        const tracks = items
            .filter((item) => item?.item?.uri)
            .map((item) => mapTrack(item.item));

        console.log(`Fetched playlist ${id} tracks, offset: ${offset}, returned: ${tracks.length}, total: ${total}`);

        return res.json({ tracks, total, limit, offset });
    } catch (error) {
        console.error('Error fetching playlist tracks:', error);
        const statusCode = error?.statusCode === 401 ? 401 : error?.statusCode === 403 ? 403 : 500;
        const errorMessage = statusCode === 403
            ? 'Forbidden from Spotify API. Ensure a valid Authorization: Bearer <token> is sent.'
            : 'Error fetching playlist tracks';
        return res.status(statusCode).json({ error: errorMessage, tracks: [] });
    }
}

async function play(req, res) {
    const { uri, device_id } = req.query;
    const playOptions = { uris: [uri] };

    if (device_id) {
        playOptions.device_id = device_id;
    }

    try {
        await spotifyApi.play(playOptions);
        console.log('Playing track:', uri);
        return res.json({ ok: true, message: 'Track playing!' });
    } catch (error) {
        console.error('Error playing track:', error);
        return res.status(500).json({ ok: false, error: 'Error playing track' });
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
        const response = await fetch(url, {
            headers: { 'User-Agent': 'AIRadioHost/1.0' },
        });

        if (!response.ok) {
            console.error('Nominatim error:', response.status, response.statusText);
            return res.status(502).json({ error: 'Geocoding service unavailable' });
        }

        const results = await response.json();

        const cities = results.map((item) => {
            const address = item.address || {};
            const city = address.city || address.town || address.village || address.municipality || q;
            const country = address.country || '';
            const displayName = country ? `${city}, ${country}` : city;
            return {
                displayName,
                city,
                country,
                latitude: parseFloat(item.lat),
                longitude: parseFloat(item.lon),
            };
        });

        return res.json(cities);
    } catch (error) {
        console.error('Error in geocodeCities:', error);
        return res.status(502).json({ error: 'Geocoding service unavailable' });
    }
}

module.exports = { search, suggestions, queueNext, playlists, playlistTracks, play, geocodeCities };
