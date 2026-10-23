const express = require('express');
const spotifyApi = require('../startup/spotify');
const defaultUserService = require('../services/user.service');
const defaultOAuthTransactionService = require('../services/oauth-transaction.service');
const defaultSessionService = require('../services/session.service');

const SCOPES = [
    'streaming', 'user-read-private', 'user-read-email', 'user-top-read', 'user-library-read',
    'playlist-read-private', 'playlist-read-collaborative', 'playlist-modify-public',
    'playlist-modify-private', 'user-read-playback-state', 'user-read-currently-playing',
    'user-modify-playback-state',
];

function createAuthRouter({
    createSpotifyClient = () => spotifyApi.createClient(),
    oauthTransactionService = defaultOAuthTransactionService,
    sessionService = defaultSessionService,
    userService = defaultUserService,
    config,
}) {
    const router = express.Router();
    const clearCookieOptions = {
        httpOnly: config.session.cookie.httpOnly,
        secure: config.session.cookie.secure,
        sameSite: config.session.cookie.sameSite,
        path: '/',
    };
    const cookieOptions = {
        ...clearCookieOptions,
        maxAge: 30 * 24 * 60 * 60 * 1000,
    };

    router.get('/login', async (_request, response) => {
        const state = await oauthTransactionService.create('/');
        response.redirect(createSpotifyClient().createAuthorizeURL(SCOPES, state, true));
    });

    router.get('/callback', async (request, response) => {
        const transaction = await oauthTransactionService.consume(request.query.state);
        if (!transaction) {
            return response.status(400).json({ error: { code: 'invalid_oauth_state', message: 'Sign-in request is invalid or expired' } });
        }
        if (request.query.error) return response.redirect(`${config.web.appOrigin}/?auth=denied`);
        if (!request.query.code) {
            return response.status(400).json({ error: { code: 'missing_authorization_code', message: 'Authorization code is required' } });
        }

        try {
            const client = createSpotifyClient();
            const grant = await client.authorizationCodeGrant(request.query.code);
            const accessToken = grant.body.access_token;
            const refreshToken = grant.body.refresh_token;
            const expiresIn = grant.body.expires_in;
            client.setAccessToken(accessToken);
            client.setRefreshToken(refreshToken);
            const profile = await client.getMe();
            const user = await userService.upsertUser(profile.body, {
                accessToken, refreshToken, tokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
            });
            await sessionService.revoke(request.cookies?.[config.session.cookie.name]);
            const sessionToken = await sessionService.create(user._id);
            response.cookie(config.session.cookie.name, sessionToken, cookieOptions);
            return response.redirect(new URL(transaction.returnTo || '/', config.web.appOrigin).toString());
        } catch {
            return response.status(502).json({ error: { code: 'spotify_authorization_failed', message: 'Unable to complete Spotify sign-in' } });
        }
    });

    router.get('/session', async (request, response) => {
        const session = await sessionService.resolve(request.cookies?.[config.session.cookie.name]);
        if (!session?.userId) {
            return response.status(401).json({ error: { code: 'unauthenticated', message: 'Sign in required' } });
        }
        return response.json({ user: {
            id: session.userId._id.toString(),
            spotifyId: session.userId.spotifyId,
            username: session.userId.username,
        } });
    });

    router.post('/logout', async (request, response) => {
        await sessionService.revoke(request.cookies?.[config.session.cookie.name]);
        response.clearCookie(config.session.cookie.name, clearCookieOptions);
        return response.status(204).end();
    });

    return router;
}

module.exports = { createAuthRouter, SCOPES };
