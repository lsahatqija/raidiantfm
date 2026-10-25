const express = require('express');
const request = require('supertest');
const configureApp = require('../src/startup/config');
const { createApiRouter } = require('../src/routes/api.routes');
const { createRateLimiter } = require('../src/middleware/rate-limit.middleware');

describe('request hardening', () => {
    it('returns a stable validation error before invoking an external API', async () => {
        const execute = vi.fn();
        const app = express();
        app.use(express.json());
        app.use((req, _res, next) => {
            req.spotify = { execute };
            next();
        });
        app.use('/api', createApiRouter());

        const response = await request(app).get(`/api/search?q=${'x'.repeat(201)}`);

        expect(response.status).toBe(422);
        expect(response.body).toEqual({
            error: {
                code: 'validation_error',
                message: 'Request input is invalid',
                details: [{ field: 'q', message: 'must contain 1 to 200 characters' }],
            },
        });
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects oversized JSON with a stable 413 response', async () => {
        const app = express();
        configureApp(app, {
            environment: 'test',
            server: { trustProxy: false, jsonBodyLimit: '1kb' },
            web: { corsOrigins: ['https://app.example'] },
        });
        app.post('/payload', (_req, res) => res.sendStatus(204));
        app.use(configureApp.errorHandler);

        const response = await request(app)
            .post('/payload')
            .set('Content-Type', 'application/json')
            .send({ value: 'x'.repeat(2048) });

        expect(response.status).toBe(413);
        expect(response.body.error.code).toBe('payload_too_large');
    });

    it('emits credentialed CORS headers only for allowlisted origins', async () => {
        const app = express();
        configureApp(app, {
            environment: 'production',
            server: { trustProxy: 1, jsonBodyLimit: '16kb' },
            web: { corsOrigins: ['https://app.example'] },
        });
        app.get('/probe', (_req, res) => res.sendStatus(204));

        const allowed = await request(app).get('/probe').set('Origin', 'https://app.example');
        const rejected = await request(app).get('/probe').set('Origin', 'https://evil.example');

        expect(allowed.headers['access-control-allow-origin']).toBe('https://app.example');
        expect(allowed.headers['access-control-allow-credentials']).toBe('true');
        expect(rejected.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('uses the shared limiter store and returns Retry-After when exhausted', async () => {
        const store = { increment: vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2) };
        const limiter = createRateLimiter({
            store,
            name: 'auth',
            max: 1,
            windowMs: 60_000,
            keyGenerator: () => 'client',
        });
        const app = express();
        app.use(limiter);
        app.get('/', (_req, res) => res.sendStatus(204));

        expect((await request(app).get('/')).status).toBe(204);
        const blocked = await request(app).get('/');

        expect(blocked.status).toBe(429);
        expect(blocked.headers['retry-after']).toBe('60');
        expect(blocked.body.error.code).toBe('rate_limited');
        expect(store.increment).toHaveBeenCalledTimes(2);
    });
});
