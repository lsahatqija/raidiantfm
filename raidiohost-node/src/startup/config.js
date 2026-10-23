const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');

module.exports = function configureApp(app, runtimeConfig) {
    
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
    //app.use(limiter);
    //app.use(speedLimiter);
};
