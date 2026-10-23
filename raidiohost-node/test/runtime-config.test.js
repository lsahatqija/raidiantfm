const { loadRuntimeConfig } = require('../src/config/runtime-config');

const validEnvironment = {
    NODE_ENV: 'development',
    PORT: '3050',
    MONGODB_URI: 'mongodb://database.example/raidiohost',
    CLIENT_ID: 'spotify-client-id',
    CLIENT_SECRET: 'spotify-client-secret',
    REDIRECT_URL: 'http://127.0.0.1:8080/auth/callback',
    APP_ORIGIN: 'http://127.0.0.1:8080',
    CORS_ORIGINS: 'http://127.0.0.1:5173,http://127.0.0.1:8080',
    TRUST_PROXY: '2',
    COOKIE_SECURE: 'false',
    SESSION_SECRET: 'session-secret-that-is-at-least-32-characters',
    TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
};

describe('loadRuntimeConfig', () => {
    it('returns normalized runtime settings for a valid environment', () => {
        const config = loadRuntimeConfig(validEnvironment);

        expect(config).toEqual({
            environment: 'development',
            server: {
                port: 3050,
                trustProxy: 2,
            },
            database: {
                uri: 'mongodb://database.example/raidiohost',
            },
            spotify: {
                clientId: 'spotify-client-id',
                clientSecret: 'spotify-client-secret',
                redirectUri: 'http://127.0.0.1:8080/auth/callback',
            },
            web: {
                appOrigin: 'http://127.0.0.1:8080',
                corsOrigins: [
                    'http://127.0.0.1:5173',
                    'http://127.0.0.1:8080',
                ],
            },
            session: {
                secret: 'session-secret-that-is-at-least-32-characters',
                cookie: {
                    name: 'raidiantfm_session',
                    httpOnly: true,
                    sameSite: 'lax',
                    secure: false,
                },
            },
            tokens: {
                encryptionKey: Buffer.alloc(32, 7),
            },
        });
    });

    it('reports every missing required setting without including secret values', () => {
        const environment = {
            ...validEnvironment,
            MONGODB_URI: '',
            CLIENT_SECRET: '',
            SESSION_SECRET: '',
        };

        expect(() => loadRuntimeConfig(environment)).toThrow(
            'Invalid runtime configuration: MONGODB_URI is required; CLIENT_SECRET is required; SESSION_SECRET is required',
        );
    });

    it('rejects malformed origins, redirect URLs, proxy values, and encryption keys', () => {
        const environment = {
            ...validEnvironment,
            REDIRECT_URL: 'not-a-url',
            APP_ORIGIN: 'http://127.0.0.1:8080/path',
            CORS_ORIGINS: '*,http://127.0.0.1:8080/path',
            TRUST_PROXY: '-1',
            TOKEN_ENCRYPTION_KEY: 'not-a-32-byte-base64-key',
        };

        expect(() => loadRuntimeConfig(environment)).toThrow(
            'Invalid runtime configuration: REDIRECT_URL must be an absolute URL; APP_ORIGIN must be an origin without a path; CORS_ORIGINS must contain exact origins without wildcards or paths; TRUST_PROXY must be false, true, or a non-negative integer; TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key',
        );
    });

    it('rejects unsupported database and redirect URL schemes', () => {
        expect(() => loadRuntimeConfig({
            ...validEnvironment,
            MONGODB_URI: 'https://database.example/raidiohost',
            REDIRECT_URL: 'ftp://127.0.0.1/auth/callback',
        })).toThrow(
            'Invalid runtime configuration: MONGODB_URI must be a MongoDB connection URL; REDIRECT_URL must use HTTP or HTTPS',
        );
    });

    it('refuses insecure production cookie and redirect settings', () => {
        const environment = {
            ...validEnvironment,
            NODE_ENV: 'production',
            REDIRECT_URL: 'http://127.0.0.1:8080/auth/callback',
            APP_ORIGIN: 'http://127.0.0.1:8080',
            CORS_ORIGINS: 'http://127.0.0.1:8080',
            COOKIE_SECURE: 'false',
        };

        expect(() => loadRuntimeConfig(environment)).toThrow(
            'Invalid runtime configuration: REDIRECT_URL must use HTTPS in production; APP_ORIGIN must use HTTPS in production; CORS_ORIGINS must use HTTPS in production; COOKIE_SECURE must be true in production',
        );
    });

    it('requires explicit loopback IP addresses for local HTTP redirects', () => {
        expect(() => loadRuntimeConfig({
            ...validEnvironment,
            REDIRECT_URL: 'http://localhost:8080/auth/callback',
        })).toThrow(
            'Invalid runtime configuration: REDIRECT_URL must use an explicit loopback IP address for local HTTP development',
        );
    });

    it('does not allow the session and token-encryption keys to reuse key material', () => {
        const sharedKey = Buffer.alloc(32, 7).toString('base64');

        expect(() => loadRuntimeConfig({
            ...validEnvironment,
            SESSION_SECRET: sharedKey,
            TOKEN_ENCRYPTION_KEY: sharedKey,
        })).toThrow(
            'Invalid runtime configuration: SESSION_SECRET and TOKEN_ENCRYPTION_KEY must be different',
        );
    });
});
