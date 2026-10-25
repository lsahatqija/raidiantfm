const express = require('express');
const radioController = require('../controllers/radio.controller');
const { validators } = require('../middleware/validation.middleware');

function createRadioRouter({ externalLimiter = (_req, _res, next) => next() } = {}) {
    const router = express.Router();
    router.get('/topics', radioController.getTopics);
    router.post('/topics', validators.topic, radioController.createTopic);
    router.get('/my-topics', radioController.getMyTopics);
    router.post('/my-topics/:topicId', validators.subscription, radioController.subscribeTopic);
    router.delete('/my-topics/:topicId', validators.subscription, radioController.unsubscribeTopic);
    router.post('/host-blurb', externalLimiter, validators.hostBlurb, radioController.getHostBlurb);
    return router;
}

module.exports = { createRadioRouter };
