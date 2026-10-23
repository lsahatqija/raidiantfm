const express = require('express');
const request = require('supertest');
const { createAuthRouter } = require('../src/routes/auth.routes');

function createFixture() {
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
        resolve: vi.fn().mockResolvedValue({
            userId: {
                _id: 'database-user',
                spotifyId: 'spotify-user',
                username: 'Test User',
            },
        }),
        revoke: vi.fn().mockResolvedValue(true),
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
        userService,
        config,
    }));

    return {
        app,
        spotifyClient,
        oauthTransactionService,
        sessionService,
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

    it('revokes only the presented session and clears its cookie', async () => {
        const fixture = createFixture();

        const response = await request(fixture.app)
            .post('/auth/logout')
            .set('Cookie', 'raidiantfm_session=session-to-revoke');

        expect(response.status).toBe(204);
        expect(fixture.sessionService.revoke).toHaveBeenCalledWith('session-to-revoke');
        expect(response.headers['set-cookie'][0]).toContain('raidiantfm_session=;');
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
