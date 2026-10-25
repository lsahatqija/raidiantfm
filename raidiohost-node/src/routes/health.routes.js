const express = require('express');
const mongoose = require('mongoose');

function createHealthRouter({ isReady = () => mongoose.connection.readyState === 1 } = {}) {
    const router = express.Router();
    router.get('/health', (_request, response) => response.json({ status: 'ok' }));
    router.get('/ready', (_request, response) => {
        const ready = isReady();
        return response.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready' });
    });
    return router;
}

module.exports = { createHealthRouter };
