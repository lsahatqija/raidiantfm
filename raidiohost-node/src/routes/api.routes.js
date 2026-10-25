const express = require('express');
const { search, suggestions, queueNext, playlists, playlistTracks, play, geocodeCities } = require('../controllers/api.controller');
const { createSpotifyContract } = require('../services/spotify-contract.service');

function createApiRouter({ quotaMode = 'development', spotifyContract = createSpotifyContract({ quotaMode }) } = {}) {
    const router = express.Router();

    router.use((request, _response, next) => {
        request.spotifyContract = spotifyContract;
        next();
    });

    router.get('/search', search);
    router.get('/suggestions', suggestions);
    router.post('/queue-next', queueNext);
    router.get('/playlists', playlists);
    router.get('/playlist/:id/items', playlistTracks);
    router.get('/play', play);
    router.get('/geocode', geocodeCities);
    return router;
}

module.exports = { createApiRouter };
