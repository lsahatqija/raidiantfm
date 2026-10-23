const express = require('express');
const request = require('supertest');
const Topic = require('../src/models/topic.model');
const userService = require('../src/services/user.service');
const { createRadioRouter } = require('../src/routes/radio.routes');

describe('private topic ownership', () => {
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => vi.restoreAllMocks());

    it('returns 403 when a user tries to subscribe to another user private topic', async () => {
        vi.spyOn(userService, 'findById').mockResolvedValue({
            _id: 'user-a', topics: [], save: vi.fn(), populate: vi.fn(),
        });
        vi.spyOn(Topic, 'findById').mockResolvedValue({
            _id: 'topic-b', isPublic: false, createdBy: { toString: () => 'user-b' },
        });
        const app = express();
        app.use(express.json());
        app.use((req, _res, next) => { req.auth = { userId: 'user-a' }; next(); });
        app.use('/api/radio', createRadioRouter());

        const response = await request(app).post('/api/radio/my-topics/topic-b').send({});
        expect(response.status).toBe(403);
        expect(response.body.error.code).toBe('forbidden');
    });
});
