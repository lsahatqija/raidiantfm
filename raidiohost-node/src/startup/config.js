const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const express = require('express');
const { createRequestContext, logger } = require('../services/logger.service');

module.exports = function configureApp(app, runtimeConfig) {
    app.use(createRequestContext(logger));
    app.use(helmet({
        contentSecurityPolicy: false, // APIs generally don't need CSP
        // Keep popup-based auth flows connected to their opener window.
        crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
        // If you serve images/fonts/files that other sites may load:
        crossOriginResourcePolicy: { policy: 'cross-origin' },
        // Skip HSTS in dev/non-HTTPS:
        hsts: runtimeConfig.environment === 'production' ? undefined : false,
    }));

    // --- CORS: configure explicitly ---
    const corsOptions = {
        origin(origin, cb) {
        if (!origin) return cb(null, true); // allow curl/postman
        return cb(null, runtimeConfig.web.corsOrigins.includes(origin));
        },
        credentials: true, // set to true only if you use cookies/Authorization from the browser
        methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
        allowedHeaders: ['Content-Type','Authorization','X-Requested-With'],
        exposedHeaders: ['Content-Length','X-Request-Id'],
        optionsSuccessStatus: 204,
    };
    
    // Vary ensures proper caching per Origin
    app.use((req, res, next) => { res.setHeader('Vary', 'Origin'); next(); });
    app.use(cors(corsOptions));
    app.set('trust proxy', runtimeConfig.server.trustProxy);
    app.use(cookieParser());
    app.use(express.json({ limit: runtimeConfig.server.jsonBodyLimit || '16kb', strict: true }));
    app.use(express.urlencoded({ extended: false, limit: '4kb', parameterLimit: 20 }));
};

module.exports.errorHandler = function requestErrorHandler(error, _request, response, next) {
    if (error?.type === 'entity.too.large') {
        return response.status(413).json({ error: { code: 'payload_too_large', message: 'Request body is too large' } });
    }
    if (error instanceof SyntaxError && error.status === 400) {
        return response.status(400).json({ error: { code: 'invalid_json', message: 'Request body is not valid JSON' } });
    }
    _request.log?.error({ event: 'request_failed', errorCode: error.code || error.name });
    if (response.headersSent) return next(error);
    return response.status(500).json({ error: { code: 'internal_error', message: 'An unexpected error occurred' } });
};
