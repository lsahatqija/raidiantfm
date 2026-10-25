const express = require('express');
const request = require('supertest');
const { createAuthRouter } = require('../src/routes/auth.routes');
const { handleAuthError } = require('../src/middleware/auth.middleware');

function createFixture() {
    const revokedSessions = new Set();
    const spotifyClient = {
        createAuthorizeURL: vi.fn((_scopes, state) => `https://accounts.spotify.com/authorize?state=${state}`),
        authorizationCodeGrant: vi.fn().mockResolvedValue({
            body: {
                access_token: 'spotify-access-token',
                refresh_token: 'spotify-refresh-token',
                expires_in: 3600,
            },
        }),
        setAccessToken: vi.fn(),
        setRefreshToken: vi.fn(),
        getMe: vi.fn().mockResolvedValue({
            body: { id: 'spotify-user', display_name: 'Test User', email: 'test@example.invalid' },
        }),
    };
    const oauthTransactionService = {
        create: vi.fn().mockResolvedValue('oauth-state'),
        consume: vi.fn().mockResolvedValue({ returnTo: '/' }),
    };
    const sessionService = {
        create: vi.fn().mockResolvedValue('opaque-session-token'),
        resolve: vi.fn(async (token) => {
            if (!token || revokedSessions.has(token)) return null;
            const userId = token === 'session-a' || token === 'session-b'
                ? `user-${token.at(-1)}`
                : 'database-user';
            return {
                userId: {
                    _id: userId,
                    spotifyId: userId === 'database-user' ? 'spotify-user' : `spotify-${userId}`,
                    username: 'Test User',
                },
            };
        }),
        revoke: vi.fn(async (token) => {
            if (token) revokedSessions.add(token);
            return true;
        }),
    };
    const spotifyTokenService = {
        getAccessToken: vi.fn(async (userId) => ({
            accessToken: `access-${userId}`,
            expiresAt: new Date('2026-10-23T22:00:00.000Z'),
        })),
    };
    const userService = {
        upsertUser: vi.fn().mockResolvedValue({
            _id: 'database-user',
            spotifyId: 'spotify-user',
        }),
    };
    const config = {
        web: { appOrigin: 'http://127.0.0.1:8080' },
        session: {
            cookie: {
                name: 'raidiantfm_session',
                httpOnly: true,
                sameSite: 'lax',
                secure: false,
            },
        },
    };
    const app = express();
    app.use(express.json());
    app.use(require('cookie-parser')());
    app.use('/auth', createAuthRouter({
        createSpotifyClient: () => spotifyClient,
        oauthTransactionService,
        sessionService,
        spotifyTokenService,
        userService,
        config,
    }));
    app.use(handleAuthError);

    return {
        app,
        spotifyClient,
        oauthTransactionService,
        sessionService,
        spotifyTokenService,
        userService,
    };
}

describe('secure authentication routes', () => {
    it('stores OAuth state before redirecting to Spotify', async () => {
        const fixture = createFixture();

        const response = await request(fixture.app).get('/auth/login');

        expect(response.status).toBe(302);
        expect(response.headers.location).toBe('https://accounts.spotify.com/authorize?state=oauth-state');
        expect(fixture.oauthTransactionService.create).toHaveBeenCalledWith('/');
        expect(require('../src/routes/auth.routes').SCOPES).not.toContain('user-read-email');
    });

    it('rejects missing, mismatched, expired, or replayed OAuth state before token exchange', async () => {
        const fixture = createFixture();
        fixture.oauthTransactionService.consume.mockResolvedValue(null);

        const response = await request(fixture.app)
            .get('/auth/callback?code=authorization-code&state=invalid-state');

        expect(response.status).toBe(400);
        expect(response.body).toEqual({ error: { code: 'invalid_oauth_state', message: 'Sign-in request is invalid or expired' } });
        expect(fixture.spotifyClient.authorizationCodeGrant).not.toHaveBeenCalled();
    });

    it('creates an application session and redirects without exposing Spotify tokens', async () => {
        const fixture = createFixture();

        const response = await request(fixture.app)
            .get('/auth/callback?code=authorization-code&state=oauth-state');

        expect(response.status).toBe(302);
        expect(response.headers.location).toBe('http://127.0.0.1:8080/');
        expect(response.headers['set-cookie'][0]).toContain('raidiantfm_session=opaque-session-token');
        expect(response.headers['set-cookie'][0]).toContain('HttpOnly');
        expect(response.headers['set-cookie'][0]).toContain('SameSite=Lax');
        expect(response.text).not.toContain('spotify-access-token');
        expect(response.text).not.toContain('spotify-refresh-token');
        expect(fixture.userService.upsertUser).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'spotify-user' }),
            expect.objectContaining({
                accessToken: 'spotify-access-token',
                refreshToken: 'spotify-refresh-token',
                tokenExpiresAt: expect.any(Date),
            }),
        );
    });

    it('revokes a pre-existing browser session before replacing its cookie', async () => {
        const fixture = createFixture();

        await request(fixture.app)
            .get('/auth/callback?code=authorization-code&state=oauth-state')
            .set('Cookie', 'raidiantfm_session=pre-existing-session');

        expect(fixture.sessionService.revoke).toHaveBeenCalledWith('pre-existing-session');
        expect(fixture.sessionService.revoke.mock.invocationCallOrder[0]).toBeLessThan(
            fixture.sessionService.create.mock.invocationCallOrder[0],
        );
    });

    it('validates state before handling an authorization denial', async () => {
        const fixture = createFixture();

        const response = await request(fixture.app)
            .get('/auth/callback?error=access_denied&state=oauth-state');

        expect(response.status).toBe(302);
        expect(response.headers.location).toBe('http://127.0.0.1:8080/?auth=denied');
        expect(fixture.spotifyClient.authorizationCodeGrant).not.toHaveBeenCalled();
    });

    it('returns the current application session without credential material', async () => {
        const fixture = createFixture();

        const response = await request(fixture.app)
            .get('/auth/session')
            .set('Cookie', 'raidiantfm_session=opaque-session-token');

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            user: {
                id: 'database-user',
                spotifyId: 'spotify-user',
                username: 'Test User',
            },
        });
        expect(JSON.stringify(response.body)).not.toMatch(/accessToken|refreshToken/i);
    });

    it('requires an application session before issuing an SDK access token', async () => {
        const fixture = createFixture();

        const response = await request(fixture.app).get('/auth/spotify-token');

        expect(response.status).toBe(401);
        expect(response.body).toEqual({
            error: { code: 'unauthenticated', message: 'Sign in required' },
        });
        expect(fixture.spotifyTokenService.getAccessToken).not.toHaveBeenCalled();
    });

    it('issues only each session user SDK access token and expiry', async () => {
        const fixture = createFixture();

        const [userA, userB] = await Promise.all([
            request(fixture.app).get('/auth/spotify-token').set('Cookie', 'raidiantfm_session=session-a'),
            request(fixture.app).get('/auth/spotify-token').set('Cookie', 'raidiantfm_session=session-b'),
        ]);

        expect(userA.status).toBe(200);
        expect(userA.headers['cache-control']).toBe('no-store');
        expect(userA.body).toEqual({
            accessToken: 'access-user-a',
            expiresAt: '2026-10-23T22:00:00.000Z',
        });
        expect(userB.body).toEqual({
            accessToken: 'access-user-b',
            expiresAt: '2026-10-23T22:00:00.000Z',
        });
        expect(JSON.stringify([userA.body, userB.body])).not.toMatch(/refresh/i);
    });

    it('revokes only the presented session and clears its cookie', async () => {
        const fixture = createFixture();

        const response = await request(fixture.app)
            .post('/auth/logout')
            .set('Cookie', 'raidiantfm_session=session-to-revoke');

        expect(response.status).toBe(204);
        expect(fixture.sessionService.revoke).toHaveBeenCalledWith('session-to-revoke');
        expect(response.headers['set-cookie'][0]).toContain('raidiantfm_session=;');

        const tokenResponse = await request(fixture.app)
            .get('/auth/spotify-token')
            .set('Cookie', 'raidiantfm_session=session-to-revoke');
        expect(tokenResponse.status).toBe(401);
    });

    it('does not expose legacy token and refresh endpoints', async () => {
        const fixture = createFixture();

        for (const [method, path] of [
            ['get', '/auth/token'],
            ['get', '/auth/tokens?code=authorization-code'],
            ['post', '/auth/refresh'],
        ]) {
            const response = await request(fixture.app)[method](path);
            expect(response.status).toBe(404);
        }
    });
});
