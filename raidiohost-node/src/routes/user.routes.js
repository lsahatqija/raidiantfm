const express = require('express');
const userController = require('../controllers/user.controller');
const { validators } = require('../middleware/validation.middleware');

// GET  /api/users/me  — fetch current user profile
function createUserRouter() {
    const router = express.Router();
    router.get('/me', userController.getMe);

// PATCH /api/users/me  — update display username
    router.patch('/me', validators.profile, userController.updateMe);

// PATCH /api/users/me/location  — update user's geographic location
    router.patch('/me/location', validators.location, userController.updateLocation);
    router.delete('/me/location', userController.clearLocation);
    router.get('/me/export', userController.exportAccount);
    router.delete('/me', validators.deletion, userController.deleteAccount);
    return router;
}

module.exports = { createUserRouter };
