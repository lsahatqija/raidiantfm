const defaultSessionService = require('../services/session.service');

function createRequireAuth({ sessionService = defaultSessionService, cookieName }) {
    return async function requireAuth(request, response, next) {
        try {
            const session = await sessionService.resolve(request.cookies?.[cookieName]);
            if (!session?.userId) {
                return response.status(401).json({ error: { code: 'unauthenticated', message: 'Sign in required' } });
            }
            request.auth = {
                sessionId: session._id.toString(),
                userId: session.userId._id.toString(),
                spotifyId: session.userId.spotifyId,
            };
            return next();
        } catch {
            return response.status(401).json({ error: { code: 'unauthenticated', message: 'Sign in required' } });
        }
    };
}

function createSpotifyContext(tokenService) {
    return function spotifyContext(request, _response, next) {
        request.spotify = {
            execute: (operation) => tokenService.execute(request.auth.userId, operation),
        };
        next();
    };
}

function handleAuthError(error, _request, response, next) {
    if (error?.code === 'reauth_required' || error?.code === 'spotify_refresh_unavailable') {
        return response.status(error.statusCode || 401).json({
            error: { code: error.code, message: error.message },
        });
    }
    return next(error);
}

module.exports = { createRequireAuth, createSpotifyContext, handleAuthError };
