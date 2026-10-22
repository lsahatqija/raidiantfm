const express = require('express');
const router = express.Router();
const radioController = require('../controllers/radio.controller');

router.get('/topics', radioController.getTopics);
router.post('/topics', radioController.createTopic);
router.get('/my-topics', radioController.getMyTopics);
router.post('/my-topics/:topicId', radioController.subscribeTopic);
router.delete('/my-topics/:topicId', radioController.unsubscribeTopic);
router.post('/host-blurb', radioController.getHostBlurb);

module.exports = router;
