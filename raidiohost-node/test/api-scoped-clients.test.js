const express = require('express');
const request = require('supertest');
const cookieParser = require('cookie-parser');
const { createApiRouter } = require('../src/routes/api.routes');
const { createRequireAuth, createSpotifyContext } = require('../src/middleware/auth.middleware');

function trackFor(userId, suffix) {
    return {
        id: `${userId}-${suffix}`,
        uri: `spotify:track:${userId}-${suffix}`,
        name: `${userId}-${suffix}`,
        artists: [{ id: `${userId}-artist`, name: `${userId}-artist` }],
        album: { name: `${userId}-album`, images: [] },
    };
}

function userIdFromPlaylist(playlistId) {
    return playlistId.endsWith('-a') ? 'user-a' : 'user-b';
}

describe('request-scoped Spotify API routes', () => {
    let app;
    let playCalls;
    let searchLimits;

    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        playCalls = [];
        searchLimits = [];

        const sessionService = {
            resolve: async (token) => token ? {
                _id: { toString: () => `session-${token}` },
                userId: { _id: { toString: () => token }, spotifyId: `spotify-${token}` },
            } : null,
        };
        const tokenService = {
            execute: async (userId, operation) => operation({
                searchTracks: async (_query, { limit }) => {
                    searchLimits.push(limit);
                    return { body: { tracks: { items: [trackFor(userId, 'search')] } } };
                },
                getMyTopTracks: async () => ({ body: { items: [trackFor(userId, 'top')] } }),
                getTrack: async () => ({ body: trackFor(userId, 'source') }),
                getArtist: async () => ({ body: { genres: [] } }),
                getRecommendations: async () => ({ body: { tracks: [trackFor(userId, 'queued')] } }),
                getUserPlaylists: async () => ({ body: {
                    items: [{
                        id: `${userId}-playlist`,
                        name: `${userId}-playlist`,
                        items: { total: 1 },
                        images: [],
                        owner: { id: userId },
                    }],
                    total: 1,
                } }),
                getAccessToken: () => `token-${userId}`,
                play: async ({ uris }) => playCalls.push({ userId, uri: uris[0] }),
            }),
        };
        const auth = createRequireAuth({ sessionService, cookieName: 'session' });

        app = express();
        app.use(express.json());
        app.use(cookieParser());
        const spotifyContract = {
            maxSearchLimit: 10,
            playlistTotalFields: 'items(total)',
            clampSearchLimit: (limit) => Math.min(Number(limit) || 10, 10),
            getPlaylistItemTotal: (playlist) => Number(playlist?.items?.total ?? 0),
            getPlaylistItems: async (_client, playlistId) => ({ body: {
                items: [{ item: trackFor(userIdFromPlaylist(playlistId), 'playlist-track') }],
                total: 1,
            } }),
        };
        app.use('/api', auth, createSpotifyContext(tokenService), createApiRouter({ spotifyContract }));
    });

    afterEach(() => vi.restoreAllMocks());

    it('keeps every Spotify-backed endpoint scoped across concurrent users', async () => {
        const calls = [
            ['user-a', '/api/search?q=test&limit=50'],
            ['user-b', '/api/search?q=test&limit=50'],
            ['user-a', '/api/suggestions'],
            ['user-b', '/api/suggestions'],
            ['user-a', '/api/playlists'],
            ['user-b', '/api/playlists'],
            ['user-a', '/api/playlist/list-a/items'],
            ['user-b', '/api/playlist/list-b/items'],
        ];
        const responses = await Promise.all(calls.map(([userId, path]) => (
            request(app).get(path).set('Cookie', `session=${userId}`)
        )));

        expect(responses[0].body.tracks[0].id).toBe('user-a-search');
        expect(responses[1].body.tracks[0].id).toBe('user-b-search');
        expect(responses[2].body.tracks[0].id).toBe('user-a-top');
        expect(responses[3].body.tracks[0].id).toBe('user-b-top');
        expect(responses[4].body.playlists[0].id).toBe('user-a-playlist');
        expect(responses[5].body.playlists[0].id).toBe('user-b-playlist');
        expect(responses[6].body.tracks[0].id).toBe('user-a-playlist-track');
        expect(responses[7].body.tracks[0].id).toBe('user-b-playlist-track');
        expect(searchLimits).toEqual([10, 10]);

        const [userAQueue, userBQueue, userAPlay, userBPlay] = await Promise.all([
            request(app).post('/api/queue-next').set('Cookie', 'session=user-a')
                .send({ track: { id: 'current-a', uri: 'spotify:track:current-a' } }),
            request(app).post('/api/queue-next').set('Cookie', 'session=user-b')
                .send({ track: { id: 'current-b', uri: 'spotify:track:current-b' } }),
            request(app).get('/api/play?uri=spotify:track:playA').set('Cookie', 'session=user-a'),
            request(app).get('/api/play?uri=spotify:track:playB').set('Cookie', 'session=user-b'),
        ]);

        expect(userAQueue.body.track.id).toBe('user-a-queued');
        expect(userBQueue.body.track.id).toBe('user-b-queued');
        expect(userAPlay.body.ok).toBe(true);
        expect(userBPlay.body.ok).toBe(true);
        expect(playCalls).toEqual(expect.arrayContaining([
            { userId: 'user-a', uri: 'spotify:track:playA' },
            { userId: 'user-b', uri: 'spotify:track:playB' },
        ]));
    });
});
