function mapTrack(track) {
    const artistNames = Array.isArray(track?.artists)
        ? track.artists.map((artist) => (typeof artist === 'string' ? artist : artist?.name)).filter(Boolean)
        : [];

    return {
        id: track.id || track.uri,
        uri: track.uri,
        name: track.name,
        artists: artistNames.join(', ') || 'Unknown Artist',
        album: typeof track.album === 'string' ? track.album : track.album?.name || 'Unknown Album',
        image: track.image || track.album?.images?.[0]?.url || null,
    };
}

function pickRandomTracks(tracks, count) {
    const shuffled = [...tracks];

    for (let i = shuffled.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled.slice(0, count);
}

function extractTrackId(track = {}) {
    const rawId = track.id || track.trackId || track.uri || '';

    if (!rawId) {
        return null;
    }

    if (rawId.startsWith('spotify:track:')) {
        return rawId.split(':').pop();
    }

    if (rawId.includes('/track/')) {
        return rawId.split('/track/')[1]?.split('?')[0] || null;
    }

    return rawId;
}

function normalizeText(value = '') {
    return `${value}`.trim().toLowerCase();
}

function getArtistNames(track = {}) {
    if (Array.isArray(track?.artists)) {
        return track.artists
            .map((artist) => (typeof artist === 'string' ? artist : artist?.name))
            .filter(Boolean);
    }

    if (typeof track?.artists === 'string') {
        return track.artists.split(',').map((name) => name.trim()).filter(Boolean);
    }

    return [];
}

function getPrimaryArtistKey(track = {}) {
    const firstArtist = getArtistNames(track)[0];
    return firstArtist ? normalizeText(firstArtist) : null;
}

function buildRecentTrackIdSet(recentTracks = []) {
    const recentIds = new Set();

    for (const track of recentTracks) {
        const extractedId = extractTrackId(track);
        if (extractedId) recentIds.add(extractedId);
        if (track?.uri) recentIds.add(track.uri);
        if (track?.id) recentIds.add(track.id);
    }

    return recentIds;
}

function addUniqueTracks(target, tracks = []) {
    const existing = new Set(target.map((track) => extractTrackId(track) || track?.uri).filter(Boolean));

    for (const track of tracks) {
        const key = extractTrackId(track) || track?.uri;

        if (track?.uri && key && !existing.has(key)) {
            existing.add(key);
            target.push(track);
        }
    }
}

function pickRandomArtistTrack(candidates = []) {
    if (!candidates.length) {
        return null;
    }

    const artistBuckets = new Map();

    for (const track of candidates) {
        const artistKey = getPrimaryArtistKey(track) || extractTrackId(track) || track.uri;

        if (!artistBuckets.has(artistKey)) {
            artistBuckets.set(artistKey, []);
        }

        artistBuckets.get(artistKey).push(track);
    }

    const artistKeys = Array.from(artistBuckets.keys());
    const chosenArtist = artistKeys[Math.floor(Math.random() * artistKeys.length)];
    const artistTracks = artistBuckets.get(chosenArtist) || candidates;

    return artistTracks[Math.floor(Math.random() * artistTracks.length)];
}

function isTrackRecentlyPlayed(track, recentTrackIds = new Set()) {
    const candidateId = extractTrackId(track);
    const candidateUri = track?.uri;

    if (!candidateUri) {
        return true;
    }

    return recentTrackIds.has(candidateId) || recentTrackIds.has(candidateUri);
}

function filterPlayableTracks(candidates = [], recentTrackIds = new Set()) {
    return candidates.filter((track) => !isTrackRecentlyPlayed(track, recentTrackIds));
}

async function searchTracksSafely(spotifyApi, query, limit = 10, maxSearchLimit = 10) {
    try {
        const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 5, 1), maxSearchLimit);
        const response = await spotifyApi.searchTracks(query, { limit: safeLimit });
        return Array.isArray(response.body?.tracks?.items) ? response.body.tracks.items : [];
    } catch {
        return [];
    }
}

async function getUserTopTrackPool(spotifyApi, limit = 100) {
    const results = await Promise.allSettled([
        spotifyApi.getMyTopTracks({ limit: 50, offset: 0 }),
        spotifyApi.getMyTopTracks({ limit: 50, offset: 50 }),
    ]);

    const tracks = [];

    for (const result of results) {
        if (result.status === 'fulfilled') {
            addUniqueTracks(tracks, Array.isArray(result.value.body?.items) ? result.value.body.items : []);
        }
    }

    return tracks.slice(0, limit);
}

async function findSimilarTrack(
    spotifyApi,
    sourceTrackInput = {},
    recentTracks = [],
    { maxSearchLimit = 10 } = {},
) {
    const sourceTrackId = extractTrackId(sourceTrackInput);
    const recentTrackIds = buildRecentTrackIdSet(recentTracks);
    const recentArtistKeys = new Set(recentTracks.map((track) => getPrimaryArtistKey(track)).filter(Boolean));

    let sourceTrack = sourceTrackInput;
    let primaryArtist = null;
    let matchedGenre = null;

    if (sourceTrackId && typeof spotifyApi.getTrack === 'function') {
        try {
            const sourceTrackResponse = await spotifyApi.getTrack(sourceTrackId);
            sourceTrack = sourceTrackResponse.body || sourceTrackInput;
        } catch {
            // Continue with the request-supplied track metadata.
        }
    }

    primaryArtist = sourceTrack?.artists?.[0] || null;
    const primaryArtistName = primaryArtist?.name || getArtistNames(sourceTrackInput)[0] || null;
    const sourceArtistKey = getPrimaryArtistKey(sourceTrack) || getPrimaryArtistKey(sourceTrackInput);

    if (primaryArtist?.id && typeof spotifyApi.getArtist === 'function') {
        try {
            const artistResponse = await spotifyApi.getArtist(primaryArtist.id);
            const artistGenres = Array.isArray(artistResponse.body?.genres) ? artistResponse.body.genres : [];
            matchedGenre = artistGenres[0] || null;
        } catch {
            // Genre enrichment is optional; fallback searches still work.
        }
    }

    if (sourceTrack?.id) recentTrackIds.add(sourceTrack.id);
    if (sourceTrack?.uri) recentTrackIds.add(sourceTrack.uri);
    if (sourceTrackId) recentTrackIds.add(sourceTrackId);
    if (sourceArtistKey) recentArtistKeys.add(sourceArtistKey);

    const candidates = [];

    if (sourceTrack?.id && typeof spotifyApi.getRecommendations === 'function') {
        try {
            const recommendations = await spotifyApi.getRecommendations({
                limit: 50,
                min_popularity: 35,
                seed_tracks: [sourceTrack.id],
            });
            addUniqueTracks(candidates, Array.isArray(recommendations.body?.tracks) ? recommendations.body.tracks : []);
        } catch {
            // Recommendation failure is non-blocking; later fallbacks remain available.
        }
    }

    if (matchedGenre) {
        addUniqueTracks(candidates, await searchTracksSafely(
            spotifyApi,
            `genre:"${matchedGenre}"`,
            25,
            maxSearchLimit,
        ));
    }

    const filteredCandidates = filterPlayableTracks(candidates, recentTrackIds);
    const freshArtistCandidates = filteredCandidates.filter((track) => {
        const artistKey = getPrimaryArtistKey(track);
        return artistKey && artistKey !== sourceArtistKey && !recentArtistKeys.has(artistKey);
    });

    if (freshArtistCandidates.length) {
        return { queuedTrack: pickRandomArtistTrack(freshArtistCandidates), matchedGenre, strategy: 'varied-artist' };
    }

    if (filteredCandidates.length) {
        return { queuedTrack: pickRandomArtistTrack(filteredCandidates), matchedGenre, strategy: 'recommendation' };
    }

    if (primaryArtistName) {
        const sameArtistTracks = await searchTracksSafely(
            spotifyApi,
            `artist:"${primaryArtistName}"`,
            30,
            maxSearchLimit,
        );
        const sameArtistCandidates = filterPlayableTracks(sameArtistTracks, recentTrackIds).filter((track) => {
            const artistKey = getPrimaryArtistKey(track);
            return artistKey && artistKey === sourceArtistKey;
        });

        if (sameArtistCandidates.length) {
            return { queuedTrack: pickRandomArtistTrack(sameArtistCandidates), matchedGenre, strategy: 'same-artist-fallback' };
        }
    }

    const topTrackCandidates = filterPlayableTracks(await getUserTopTrackPool(spotifyApi, 100), recentTrackIds);

    if (topTrackCandidates.length) {
        return { queuedTrack: pickRandomArtistTrack(topTrackCandidates), matchedGenre, strategy: 'top-tracks-fallback' };
    }

    return { queuedTrack: null, matchedGenre, strategy: 'none' };
}

module.exports = {
    mapTrack,
    pickRandomTracks,
    extractTrackId,
    normalizeText,
    getArtistNames,
    getPrimaryArtistKey,
    buildRecentTrackIdSet,
    addUniqueTracks,
    pickRandomArtistTrack,
    isTrackRecentlyPlayed,
    filterPlayableTracks,
    searchTracksSafely,
    getUserTopTrackPool,
    findSimilarTrack,
};
