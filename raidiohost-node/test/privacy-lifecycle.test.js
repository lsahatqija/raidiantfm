const express = require('express');
const request = require('supertest');
const userService = require('../src/services/user.service');
const { createUserRouter } = require('../src/routes/user.routes');

function createApp() {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
        req.auth = { userId: 'user-a', sessionId: 'session-a' };
        next();
    });
    app.use('/api/users', createUserRouter());
    return app;
}

describe('privacy lifecycle', () => {
    afterEach(() => vi.restoreAllMocks());

    it('requires explicit consent and stores only a city label', async () => {
        const update = vi.spyOn(userService, 'updateLocationById').mockResolvedValue({
            spotifyId: 'spotify-a',
            location: { city: 'Budapest, Hungary', consentAt: new Date('2026-10-25T08:00:00Z') },
            updatedAt: new Date('2026-10-25T08:00:00Z'),
        });

        const denied = await request(createApp()).patch('/api/users/me/location').send({ city: 'Budapest, Hungary' });
        expect(denied.status).toBe(422);

        const response = await request(createApp()).patch('/api/users/me/location').send({
            city: 'Budapest, Hungary', consent: true,
        });
        expect(response.status).toBe(200);
        expect(update).toHaveBeenCalledWith('user-a', { city: 'Budapest, Hungary', consent: true });
        expect(JSON.stringify(update.mock.calls)).not.toMatch(/latitude|longitude/);
    });

    it('exports an allowlisted copy without credentials', async () => {
        vi.spyOn(userService, 'exportAccountById').mockResolvedValue({
            profile: { spotifyId: 'spotify-a', username: 'Listener A' },
            preferences: { lastVolume: 0.5 },
            privateTopics: [],
        });

        const response = await request(createApp()).get('/api/users/me/export');

        expect(response.status).toBe(200);
        expect(response.headers['content-disposition']).toContain('attachment');
        expect(response.body.profile.username).toBe('Listener A');
        expect(JSON.stringify(response.body)).not.toMatch(/accessToken|refreshToken|spotifyCredentials/i);
    });

    it('deletes the account only after explicit confirmation', async () => {
        const remove = vi.spyOn(userService, 'deleteAccountById').mockResolvedValue(true);

        expect((await request(createApp()).delete('/api/users/me').send({})).status).toBe(422);
        const response = await request(createApp()).delete('/api/users/me').send({ confirmation: 'DELETE' });

        expect(response.status).toBe(204);
        expect(remove).toHaveBeenCalledWith('user-a');
    });

    it('fails authentication after account deletion', async () => {
        vi.spyOn(userService, 'deleteAccountById').mockResolvedValue(true);
        await request(createApp()).delete('/api/users/me').send({ confirmation: 'DELETE' });

        const sessionService = { resolve: vi.fn().mockResolvedValue(null) };
        const { createRequireAuth } = require('../src/middleware/auth.middleware');
        const protectedApp = express();
        protectedApp.use(createRequireAuth({ sessionService, cookieName: 'session' }));
        protectedApp.get('/', (_req, res) => res.sendStatus(204));
        expect((await request(protectedApp).get('/').set('Cookie', 'session=deleted')).status).toBe(401);
    });
});
