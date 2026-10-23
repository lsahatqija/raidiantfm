const express = require('express');
const request = require('supertest');
const cookieParser = require('cookie-parser');
const userService = require('../src/services/user.service');
const Topic = require('../src/models/topic.model');
const { createApiRouter } = require('../src/routes/api.routes');
const { createUserRouter } = require('../src/routes/user.routes');
const { createRadioRouter } = require('../src/routes/radio.routes');
const { createRequireAuth, createSpotifyContext } = require('../src/middleware/auth.middleware');

describe('cross-user request isolation regression', () => {
    let app;

    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(userService, 'findById').mockImplementation(async (userId) => ({
            _id: userId,
            spotifyId: `spotify-${userId}`,
            username: userId,
            spotifyDisplayName: userId,
            spotifyEmail: '',
            lastVolume: 0.5,
        }));
        vi.spyOn(Topic, 'find').mockImplementation(async (query) => ([{
            _id: 'topic-1',
            name: `topic-for-${query.$or[1].createdBy}`,
        }]));

        const sessionService = {
            resolve: async (token) => token ? {
                _id: { toString: () => `session-${token}` },
                userId: { _id: { toString: () => token }, spotifyId: `spotify-${token}` },
            } : null,
        };
        const tokenService = {
            execute: async (userId, operation) => operation({
                searchTracks: async (query) => ({ body: { tracks: { items: [{
                    id: `${userId}-${query}`,
                    uri: `spotify:track:${userId}-${query}`,
                    name: `${userId}-${query}`,
                    artists: [{ name: 'Fixture Artist' }],
                    album: { name: 'Fixture Album', images: [] },
                }] } } }),
            }),
        };
        const auth = createRequireAuth({ sessionService, cookieName: 'session' });

        app = express();
        app.use(express.json());
        app.use(cookieParser());
        app.use('/api/users', auth, createUserRouter());
        app.use('/api/radio', auth, createRadioRouter());
        app.use('/api', auth, createSpotifyContext(tokenService), createApiRouter());
    });

    afterEach(() => vi.restoreAllMocks());

    it('keeps two sessions independent across concurrent Spotify, profile, and topic requests', async () => {
        const [userASearch, userBSearch, userAProfile, userBProfile, userATopics, userBTopics] = await Promise.all([
            request(app).get('/api/search?q=alpha').set('Cookie', 'session=user-a'),
            request(app).get('/api/search?q=beta').set('Cookie', 'session=user-b'),
            request(app).get('/api/users/me').set('Cookie', 'session=user-a'),
            request(app).get('/api/users/me').set('Cookie', 'session=user-b'),
            request(app).get('/api/radio/topics').set('Cookie', 'session=user-a'),
            request(app).get('/api/radio/topics').set('Cookie', 'session=user-b'),
        ]);

        expect(userASearch.body.tracks[0].name).toBe('user-a-alpha');
        expect(userBSearch.body.tracks[0].name).toBe('user-b-beta');
        expect(userAProfile.body.spotifyId).toBe('spotify-user-a');
        expect(userBProfile.body.spotifyId).toBe('spotify-user-b');
        expect(userATopics.body.topics[0].name).toBe('topic-for-user-a');
        expect(userBTopics.body.topics[0].name).toBe('topic-for-user-b');
    });
});
