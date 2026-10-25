const express = require('express');
const request = require('supertest');
const { createLogger, createRequestContext } = require('../src/services/logger.service');
const { createHealthRouter } = require('../src/routes/health.routes');
const { createGracefulShutdown } = require('../src/startup/graceful-shutdown');

describe('operations', () => {
    it('writes structured events while redacting secrets and personal data', () => {
        const lines = [];
        const logger = createLogger({ write: (line) => lines.push(JSON.parse(line)) });

        logger.info({
            event: 'session_created',
            requestId: 'request-1',
            accessToken: 'secret-token',
            email: 'listener@example.invalid',
            latitude: 47.5,
            nested: { refresh_token: 'refresh-secret' },
        });

        expect(lines[0]).toMatchObject({ level: 'info', event: 'session_created', requestId: 'request-1' });
        expect(JSON.stringify(lines[0])).not.toContain('secret-token');
        expect(JSON.stringify(lines[0])).not.toContain('listener@example.invalid');
        expect(JSON.stringify(lines[0])).not.toContain('47.5');
        expect(lines[0].accessToken).toBe('[REDACTED]');
    });

    it('assigns and returns a request ID without logging query values', async () => {
        const lines = [];
        const logger = createLogger({ write: (line) => lines.push(JSON.parse(line)) });
        const app = express();
        app.use(createRequestContext(logger));
        app.get('/probe', (_req, res) => res.sendStatus(204));

        const response = await request(app).get('/probe?token=do-not-log').set('X-Request-Id', 'test-request-1');

        expect(response.headers['x-request-id']).toBe('test-request-1');
        expect(lines.at(-1)).toMatchObject({ event: 'request_completed', requestId: 'test-request-1', path: '/probe' });
        expect(JSON.stringify(lines)).not.toContain('do-not-log');
    });

    it('keeps liveness healthy while readiness follows Mongo connectivity', async () => {
        let ready = false;
        const app = express();
        app.use(createHealthRouter({ isReady: () => ready }));

        expect((await request(app).get('/health')).status).toBe(200);
        expect((await request(app).get('/ready')).status).toBe(503);
        ready = true;
        expect((await request(app).get('/ready')).status).toBe(200);
    });

    it('stops accepting traffic and disconnects the database during shutdown', async () => {
        const server = { close: vi.fn((callback) => callback()) };
        const database = { disconnect: vi.fn().mockResolvedValue() };
        const logger = { info: vi.fn(), error: vi.fn() };
        const shutdown = createGracefulShutdown({ server, database, logger, exit: vi.fn() });

        await shutdown('SIGTERM');

        expect(server.close).toHaveBeenCalledOnce();
        expect(database.disconnect).toHaveBeenCalledOnce();
    });
});
