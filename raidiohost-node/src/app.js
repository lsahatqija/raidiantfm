const express = require('express');
const { createHealthRouter } = require('./routes/health.routes');
const spotify = require('./startup/spotify');
const userService = require('./services/user.service');
const oauthTransactionService = require('./services/oauth-transaction.service');
const sessionService = require('./services/session.service');

function createApp(runtimeConfig) {
    spotify.initialize(runtimeConfig.spotify);
    userService.initializeTokenEncryption(runtimeConfig.tokens.encryptionKey);
    oauthTransactionService.initialize(runtimeConfig.session.secret);
    sessionService.initialize(runtimeConfig.session.secret);

    const app = express();
    require('./startup/config')(app, runtimeConfig);
    app.use(createHealthRouter());
    require('./startup/routes')(app, runtimeConfig);
    return app;
}

module.exports = { createApp };
