const express = require('express');
const request = require('supertest');
const cookieParser = require('cookie-parser');
const { createRequireAuth } = require('../src/middleware/auth.middleware');
const { createApiRouter } = require('../src/routes/api.routes');
const { createUserRouter } = require('../src/routes/user.routes');
const { createRadioRouter } = require('../src/routes/radio.routes');

function appFor(resolve) {
    const app = express();
    app.use(cookieParser());
    app.get('/private', createRequireAuth({
        cookieName: 'session',
        sessionService: { resolve },
    }), (req, res) => res.json({ auth: req.auth }));
    return app;
}

describe('application session middleware', () => {
    it.each([
        ['missing', undefined],
        ['expired', null],
        ['revoked', null],
    ])('returns a stable 401 for a %s session', async (_label, resolved) => {
        const response = await request(appFor(vi.fn().mockResolvedValue(resolved)))
            .get('/private')
            .set('Cookie', 'session=opaque');
        expect(response.status).toBe(401);
        expect(response.body).toEqual({ error: { code: 'unauthenticated', message: 'Sign in required' } });
    });

    it('resolves the cookie once and binds database identity to the request', async () => {
        const resolve = vi.fn().mockResolvedValue({
            _id: { toString: () => 'session-a' },
            userId: { _id: { toString: () => 'user-a' }, spotifyId: 'spotify-a' },
        });
        const response = await request(appFor(resolve)).get('/private').set('Cookie', 'session=opaque');
        expect(response.body.auth).toEqual({ sessionId: 'session-a', userId: 'user-a', spotifyId: 'spotify-a' });
        expect(resolve).toHaveBeenCalledOnce();
    });

    it('protects Spotify, user, radio, geocoding, and playback route families', async () => {
        const resolve = vi.fn().mockResolvedValue(null);
        const app = express();
        app.use(cookieParser());
        const auth = createRequireAuth({ sessionService: { resolve }, cookieName: 'session' });
        app.use('/api/users', auth, createUserRouter());
        app.use('/api/radio', auth, createRadioRouter());
        app.use('/api', auth, createApiRouter());

        const paths = [
            '/api/search?q=test',
            '/api/users/me',
            '/api/radio/topics',
            '/api/geocode?q=Budapest',
            '/api/play?uri=spotify%3Atrack%3Atest',
        ];
        const responses = await Promise.all(paths.map((path) => request(app).get(path)));
        expect(responses.map(({ status }) => status)).toEqual([401, 401, 401, 401, 401]);
        expect(resolve).toHaveBeenCalledTimes(paths.length);
    });
});
