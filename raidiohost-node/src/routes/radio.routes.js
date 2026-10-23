const express = require('express');
const radioController = require('../controllers/radio.controller');

function createRadioRouter() {
    const router = express.Router();
    router.get('/topics', radioController.getTopics);
    router.post('/topics', radioController.createTopic);
    router.get('/my-topics', radioController.getMyTopics);
    router.post('/my-topics/:topicId', radioController.subscribeTopic);
    router.delete('/my-topics/:topicId', radioController.unsubscribeTopic);
    router.post('/host-blurb', radioController.getHostBlurb);
    return router;
}

module.exports = { createRadioRouter };
