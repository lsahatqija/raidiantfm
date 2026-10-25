const express = require('express');
const { search, suggestions, queueNext, playlists, playlistTracks, play, geocodeCities } = require('../controllers/api.controller');
const { createSpotifyContract } = require('../services/spotify-contract.service');
const { validators } = require('../middleware/validation.middleware');

function createApiRouter({ quotaMode = 'development', spotifyContract = createSpotifyContract({ quotaMode }), externalLimiter = (_req, _res, next) => next() } = {}) {
    const router = express.Router();

    router.use((request, _response, next) => {
        request.spotifyContract = spotifyContract;
        next();
    });

    router.get('/search', validators.search, search);
    router.get('/suggestions', suggestions);
    router.post('/queue-next', validators.queue, queueNext);
    router.get('/playlists', validators.pagination, playlists);
    router.get('/playlist/:id/items', validators.playlist, playlistTracks);
    router.get('/play', validators.play, play);
    router.get('/geocode', externalLimiter, validators.geocode, geocodeCities);
    return router;
}

module.exports = { createApiRouter };
