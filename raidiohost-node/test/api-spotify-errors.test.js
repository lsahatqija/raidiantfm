const express = require('express');
const request = require('supertest');
const { createApiRouter } = require('../src/routes/api.routes');

function createAppWithSpotifyExecute(execute) {
    const app = express();
    app.use(express.json());
    app.use('/api', (req, _res, next) => {
        req.spotify = { execute };
        next();
    }, createApiRouter());
    return app;
}

function createAppWithSpotifyError(error) {
    return createAppWithSpotifyExecute(async () => {
        throw error;
    });
}

describe('Spotify API error contracts', () => {
    afterEach(() => vi.restoreAllMocks());

    it('maps forbidden Spotify failures without exposing upstream error details', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        const app = createAppWithSpotifyError({
            statusCode: 403,
            message: 'Authorization: Bearer spotify-access-token',
            body: { error: { status: 403, message: 'spotify-access-token' } },
        });

        const response = await request(app).get('/api/search?q=test');

        expect(response.status).toBe(403);
        expect(response.body).toEqual({
            error: {
                code: 'spotify_forbidden',
                message: 'Spotify denied this request',
            },
        });
        expect(JSON.stringify(consoleError.mock.calls)).not.toContain('spotify-access-token');
    });

    it('maps Spotify rate limits to a stable retryable error code', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const app = createAppWithSpotifyError({
            statusCode: 429,
            headers: { 'retry-after': '7' },
        });

        const response = await request(app).get('/api/suggestions');

        expect(response.status).toBe(429);
        expect(response.headers['retry-after']).toBe('7');
        expect(response.body).toEqual({
            error: {
                code: 'spotify_rate_limited',
                message: 'Spotify is temporarily rate limited',
            },
        });
    });

    it('uses a fixed message for reauthorization errors', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        const app = createAppWithSpotifyError({
            code: 'reauth_required',
            statusCode: 401,
            message: 'Refresh token spotify-refresh-token is invalid',
        });

        const response = await request(app).get('/api/search?q=test');

        expect(response.status).toBe(401);
        expect(response.body).toEqual({
            error: {
                code: 'reauth_required',
                message: 'Spotify authorization is required',
            },
        });
        expect(JSON.stringify(consoleError.mock.calls)).not.toContain('spotify-refresh-token');
    });

    it('redacts failures swallowed by the non-blocking queue strategy', async () => {
        const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const app = createAppWithSpotifyExecute(async (operation) => operation({
            getTrack: async () => {
                throw new Error('Authorization: Bearer queue-access-token');
            },
            getMyTopTracks: async () => {
                throw new Error('queue-access-token');
            },
        }));

        const response = await request(app)
            .post('/api/queue-next')
            .send({ track: { id: 'source-track', uri: 'spotify:track:source-track' } });

        expect(response.status).toBe(200);
        expect(response.body.strategy).toBe('none');
        expect(JSON.stringify(consoleWarn.mock.calls)).not.toContain('queue-access-token');
    });
});
