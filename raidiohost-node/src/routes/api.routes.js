const express = require('express');
const { search, suggestions, queueNext, playlists, playlistTracks, play, geocodeCities } = require('../controllers/api.controller');

function createApiRouter() {
    const router = express.Router();

    router.get('/search', search);
    router.get('/suggestions', suggestions);
    router.post('/queue-next', queueNext);
    router.get('/playlists', playlists);
    router.get('/playlist/:id/tracks', playlistTracks);
    router.get('/play', play);
    router.get('/geocode', geocodeCities);
    return router;
}

module.exports = { createApiRouter };
