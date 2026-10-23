const REQUIRED_SETTINGS = [
    'PORT',
    'MONGODB_URI',
    'CLIENT_ID',
    'CLIENT_SECRET',
    'REDIRECT_URL',
    'APP_ORIGIN',
    'CORS_ORIGINS',
    'TRUST_PROXY',
    'COOKIE_SECURE',
    'SESSION_SECRET',
    'TOKEN_ENCRYPTION_KEY',
];

function parseUrl(value) {
    try {
        return new URL(value);
    } catch {
        return null;
    }
}

function isExactOrigin(value) {
    const url = parseUrl(value);
    return Boolean(
        url
        && (url.protocol === 'http:' || url.protocol === 'https:')
        && url.origin === value
        && url.pathname === '/',
    );
}

function parseBoolean(value) {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return null;
}

function parseTrustProxy(value) {
    const booleanValue = parseBoolean(value);
    if (booleanValue !== null) return booleanValue;
    if (/^\d+$/.test(value)) return Number(value);
    return null;
}

function parseEncryptionKey(value) {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) {
        return null;
    }

    const key = Buffer.from(value, 'base64');
    return key.length === 32 && key.toString('base64') === value ? key : null;
}

function loadRuntimeConfig(environment = process.env) {
    const errors = [];
    const missing = new Set();

    for (const name of REQUIRED_SETTINGS) {
        if (!environment[name]?.trim()) {
            missing.add(name);
            errors.push(`${name} is required`);
        }
    }

    const nodeEnvironment = environment.NODE_ENV?.trim() || 'development';
    if (!['development', 'test', 'production'].includes(nodeEnvironment)) {
        errors.push('NODE_ENV must be development, test, or production');
    }

    const port = Number(environment.PORT);
    if (!missing.has('PORT') && (!Number.isInteger(port) || port < 1 || port > 65535)) {
        errors.push('PORT must be an integer from 1 to 65535');
    }

    const databaseUrl = missing.has('MONGODB_URI') ? null : parseUrl(environment.MONGODB_URI);
    if (
        !missing.has('MONGODB_URI')
        && (!databaseUrl || !['mongodb:', 'mongodb+srv:'].includes(databaseUrl.protocol))
    ) {
        errors.push('MONGODB_URI must be a MongoDB connection URL');
    }

    const redirectUri = missing.has('REDIRECT_URL') ? null : parseUrl(environment.REDIRECT_URL);
    if (!missing.has('REDIRECT_URL') && !redirectUri) {
        errors.push('REDIRECT_URL must be an absolute URL');
    }
    if (redirectUri && !['http:', 'https:'].includes(redirectUri.protocol)) {
        errors.push('REDIRECT_URL must use HTTP or HTTPS');
    }
    if (
        redirectUri
        && nodeEnvironment !== 'production'
        && redirectUri.protocol === 'http:'
        && !['127.0.0.1', '[::1]'].includes(redirectUri.hostname)
    ) {
        errors.push('REDIRECT_URL must use an explicit loopback IP address for local HTTP development');
    }

    const appOrigin = environment.APP_ORIGIN?.trim();
    if (!missing.has('APP_ORIGIN') && !isExactOrigin(appOrigin)) {
        errors.push('APP_ORIGIN must be an origin without a path');
    }

    const corsOrigins = missing.has('CORS_ORIGINS')
        ? []
        : environment.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean);
    if (
        !missing.has('CORS_ORIGINS')
        && (corsOrigins.length === 0 || corsOrigins.some((origin) => origin === '*' || !isExactOrigin(origin)))
    ) {
        errors.push('CORS_ORIGINS must contain exact origins without wildcards or paths');
    }

    const trustProxy = missing.has('TRUST_PROXY') ? null : parseTrustProxy(environment.TRUST_PROXY.trim());
    if (!missing.has('TRUST_PROXY') && trustProxy === null) {
        errors.push('TRUST_PROXY must be false, true, or a non-negative integer');
    }

    const cookieSecure = missing.has('COOKIE_SECURE') ? null : parseBoolean(environment.COOKIE_SECURE.trim());
    if (!missing.has('COOKIE_SECURE') && cookieSecure === null) {
        errors.push('COOKIE_SECURE must be true or false');
    }

    if (!missing.has('SESSION_SECRET') && environment.SESSION_SECRET.length < 32) {
        errors.push('SESSION_SECRET must contain at least 32 characters');
    }

    const encryptionKey = missing.has('TOKEN_ENCRYPTION_KEY')
        ? null
        : parseEncryptionKey(environment.TOKEN_ENCRYPTION_KEY.trim());
    if (!missing.has('TOKEN_ENCRYPTION_KEY') && !encryptionKey) {
        errors.push('TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key');
    }

    if (nodeEnvironment === 'production') {
        if (redirectUri && redirectUri.protocol !== 'https:') {
            errors.push('REDIRECT_URL must use HTTPS in production');
        }
        if (isExactOrigin(appOrigin) && !appOrigin.startsWith('https://')) {
            errors.push('APP_ORIGIN must use HTTPS in production');
        }
        if (corsOrigins.length > 0 && corsOrigins.some((origin) => !origin.startsWith('https://'))) {
            errors.push('CORS_ORIGINS must use HTTPS in production');
        }
        if (cookieSecure === false) {
            errors.push('COOKIE_SECURE must be true in production');
        }
    }

    if (
        !missing.has('SESSION_SECRET')
        && !missing.has('TOKEN_ENCRYPTION_KEY')
        && environment.SESSION_SECRET === environment.TOKEN_ENCRYPTION_KEY
    ) {
        errors.push('SESSION_SECRET and TOKEN_ENCRYPTION_KEY must be different');
    }

    if (errors.length > 0) {
        throw new Error(`Invalid runtime configuration: ${errors.join('; ')}`);
    }

    return {
        environment: nodeEnvironment,
        server: {
            port,
            trustProxy,
        },
        database: {
            uri: environment.MONGODB_URI,
        },
        spotify: {
            clientId: environment.CLIENT_ID,
            clientSecret: environment.CLIENT_SECRET,
            redirectUri: environment.REDIRECT_URL,
        },
        web: {
            appOrigin,
            corsOrigins,
        },
        session: {
            secret: environment.SESSION_SECRET,
            cookie: {
                name: environment.SESSION_COOKIE_NAME?.trim() || 'raidiantfm_session',
                httpOnly: true,
                sameSite: 'lax',
                secure: cookieSecure,
            },
        },
        tokens: {
            encryptionKey,
        },
    };
}

module.exports = { loadRuntimeConfig };
