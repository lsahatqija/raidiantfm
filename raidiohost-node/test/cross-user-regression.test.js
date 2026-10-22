const express = require('express');
const request = require('supertest');
const spotifyApi = require('../src/startup/spotify');
const userService = require('../src/services/user.service');
const Topic = require('../src/models/topic.model');
const apiRoutes = require('../src/routes/api.routes');
const userRoutes = require('../src/routes/user.routes');
const radioRoutes = require('../src/routes/radio.routes');

const originalSpotify = {
    getMe: spotifyApi.getMe,
    searchTracks: spotifyApi.searchTracks,
    setAccessToken: spotifyApi.setAccessToken,
};
const originalFindBySpotifyId = userService.findBySpotifyId;
const originalTopicFind = Topic.find;

describe('known cross-user Spotify client regression', () => {
    let activeToken;
    let app;
    let pendingGetMeGate;

    beforeEach(() => {
        activeToken = null;
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});

        spotifyApi.setAccessToken = (token) => {
            activeToken = token;
        };
        spotifyApi.searchTracks = async (query) => ({
            body: {
                tracks: {
                    items: [{
                        id: `${activeToken}-${query}`,
                        uri: `spotify:track:${activeToken}-${query}`,
                        name: `${activeToken}-${query}`,
                        artists: [{ name: 'Fixture Artist' }],
                        album: { name: 'Fixture Album', images: [] },
                    }],
                },
            },
        });
        spotifyApi.getMe = async () => {
            if (pendingGetMeGate) {
                const gate = pendingGetMeGate;
                pendingGetMeGate = null;
                gate.started();
                await gate.wait;
            }
            return { body: { id: activeToken } };
        };
        userService.findBySpotifyId = async (spotifyId) => ({
            _id: `db-${spotifyId}`,
            spotifyId,
            username: spotifyId,
            spotifyDisplayName: spotifyId,
            spotifyEmail: '',
            lastVolume: 0.5,
        });
        Topic.find = async (query) => ([{
            _id: 'topic-1',
            name: `topic-for-${query.$or[1].createdBy}`,
        }]);

        app = express();
        app.use(express.json());
        app.use('/api', apiRoutes);
        app.use('/api/users', userRoutes);
        app.use('/api/radio', radioRoutes);
    });

    afterEach(() => {
        spotifyApi.getMe = originalSpotify.getMe;
        spotifyApi.searchTracks = originalSpotify.searchTracks;
        spotifyApi.setAccessToken = originalSpotify.setAccessToken;
        userService.findBySpotifyId = originalFindBySpotifyId;
        Topic.find = originalTopicFind;
        vi.restoreAllMocks();
    });

    it.fails('keeps User A bound to profile and topic requests after User B uses a Spotify data route', async () => {
        const userASearch = await request(app)
            .get('/api/search?q=alpha')
            .set('Authorization', 'Bearer user-a');
        const userBSearch = await request(app)
            .get('/api/search?q=beta')
            .set('Authorization', 'Bearer user-b');

        expect(userASearch.body.tracks[0].name).toBe('user-a-alpha');
        expect(userBSearch.body.tracks[0].name).toBe('user-b-beta');

        const interleaveWithUserB = async (userAPath, userBQuery) => {
            let releaseGetMe;
            let markGetMeStarted;
            const getMeStarted = new Promise((resolve) => { markGetMeStarted = resolve; });
            pendingGetMeGate = {
                started: markGetMeStarted,
                wait: new Promise((resolve) => { releaseGetMe = resolve; }),
            };

            const userARequest = request(app)
                .get(userAPath)
                .set('Authorization', 'Bearer user-a')
                .then((response) => response);
            await getMeStarted;
            await request(app)
                .get(`/api/search?q=${userBQuery}`)
                .set('Authorization', 'Bearer user-b');
            releaseGetMe();
            return userARequest;
        };

        const userAProfile = await interleaveWithUserB('/api/users/me', 'profile-race');
        const userATopics = await interleaveWithUserB('/api/radio/topics', 'topic-race');

        expect(userAProfile.body.spotifyId).toBe('user-a');
        expect(userATopics.body.topics[0].name).toBe('topic-for-db-user-a');
    });
});
