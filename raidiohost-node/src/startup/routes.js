const express = require('express');
const { createAuthRouter } = require('../routes/auth.routes');
const { createApiRouter } = require('../routes/api.routes');
const { createUserRouter } = require('../routes/user.routes');
const { createRadioRouter } = require('../routes/radio.routes');
const { createSpotifyTokenService } = require('../services/spotify-token.service');
const { createRequireAuth, createSpotifyContext, handleAuthError } = require('../middleware/auth.middleware');

module.exports = function configureRoutes(app, runtimeConfig) {
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    const spotifyTokenService = createSpotifyTokenService();
    app.use('/auth', createAuthRouter({ config: runtimeConfig, spotifyTokenService }));
    const requireAuth = createRequireAuth({ cookieName: runtimeConfig.session.cookie.name });
    const spotifyContext = createSpotifyContext(spotifyTokenService);
    app.use('/api/users', requireAuth, createUserRouter());
    app.use('/api/radio', requireAuth, createRadioRouter());
    app.use('/api', requireAuth, spotifyContext, createApiRouter({
        quotaMode: runtimeConfig.spotify.quotaMode,
    }));
    app.use(handleAuthError);
}
