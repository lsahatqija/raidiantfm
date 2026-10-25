const { createAuthRouter } = require('../routes/auth.routes');
const { createApiRouter } = require('../routes/api.routes');
const { createUserRouter } = require('../routes/user.routes');
const { createRadioRouter } = require('../routes/radio.routes');
const { createSpotifyTokenService } = require('../services/spotify-token.service');
const { createRequireAuth, createSpotifyContext, handleAuthError } = require('../middleware/auth.middleware');
const { createRateLimiter } = require('../middleware/rate-limit.middleware');
const configureApp = require('./config');

module.exports = function configureRoutes(app, runtimeConfig) {
    const spotifyTokenService = createSpotifyTokenService();
    const authLimiter = createRateLimiter({ name: 'auth', ...runtimeConfig.rateLimits.auth });
    const externalLimiter = createRateLimiter({ name: 'external', ...runtimeConfig.rateLimits.external });
    app.use('/auth', createAuthRouter({ config: runtimeConfig, spotifyTokenService, authLimiter }));
    const requireAuth = createRequireAuth({ cookieName: runtimeConfig.session.cookie.name });
    const spotifyContext = createSpotifyContext(spotifyTokenService);
    app.locals.sessionCookie = runtimeConfig.session.cookie;
    app.use('/api/users', requireAuth, createUserRouter());
    app.use('/api/radio', requireAuth, createRadioRouter({ externalLimiter }));
    app.use('/api', requireAuth, spotifyContext, createApiRouter({
        quotaMode: runtimeConfig.spotify.quotaMode,
        externalLimiter,
    }));
    app.use((request, response) => response.status(404).json({
        error: { code: 'not_found', message: 'Route not found' },
    }));
    app.use(handleAuthError);
    app.use(configureApp.errorHandler);
}
