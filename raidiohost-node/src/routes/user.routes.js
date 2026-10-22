const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');

// GET  /api/users/me  — fetch current user profile
router.get('/me', userController.getMe);

// PATCH /api/users/me  — update display username
router.patch('/me', userController.updateMe);

// PATCH /api/users/me/location  — update user's geographic location
router.patch('/me/location', userController.updateLocation);

module.exports = router;
