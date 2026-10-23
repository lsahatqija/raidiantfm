const SpotifyWebApi = require('spotify-web-api-node');

let spotifyConfig;

function initialize(config) {
    spotifyConfig = { ...config };
}

function createClient() {
    if (!spotifyConfig) throw new Error('Spotify client factory has not been initialized');
    return new SpotifyWebApi(spotifyConfig);
}

module.exports = { initialize, createClient };
