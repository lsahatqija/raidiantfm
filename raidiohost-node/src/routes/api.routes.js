const express = require('express');
const router = express.Router();
const spotifyApi = require('../startup/spotify');
const { search, suggestions, queueNext, playlists, playlistTracks, play, geocodeCities } = require('../controllers/api.controller');

// Use the access token supplied by the frontend (Authorization: Bearer) when present.
router.use((req, _res, next) => {
    const auth = req.headers.authorization || '';
    if (auth.startsWith('Bearer ')) {
        spotifyApi.setAccessToken(auth.slice(7));
    }
    next();
});

router.get('/search', search);
router.get('/suggestions', suggestions);
router.post('/queue-next', queueNext);
router.get('/playlists', playlists);
router.get('/playlist/:id/tracks', playlistTracks);
router.get('/play', play);
router.get('/geocode', geocodeCities);

module.exports = router;