require('dotenv-flow').config();
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');

module.exports = function(app){
    
    app.use(helmet({
        contentSecurityPolicy: false, // APIs generally don't need CSP
        // Keep popup-based auth flows connected to their opener window.
        crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
        // If you serve images/fonts/files that other sites may load:
        crossOriginResourcePolicy: { policy: 'cross-origin' },
        // Skip HSTS in dev/non-HTTPS:
        hsts: process.env.NODE_ENV === 'production' ? undefined : false,
    }));

    // --- CORS: configure explicitly ---
    const allowedOrigins = (process.env.CORS_ORIGINS)
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

    allowedOrigins.push(
        'http://localhost',
        'http://127.0.0.1',
        'http://127.0.0.1:3050',
        'http://192.168.101.213:3050',
        'http://localhost:5173'
        );
        
    const corsOptions = {
        origin(origin, cb) {
        if (!origin) return cb(null, true); // allow curl/postman
        return cb(null, allowedOrigins.includes(origin));
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
    app.set('trust proxy', 2); // trust first proxy (if behind one)
    app.use(cookieParser());
    //app.use(limiter);
    //app.use(speedLimiter);

    if (!process.env.JWT_KEY){
        throw new Error("FATAL ERROR: JWT_KEY is not defined!");
    }
}
