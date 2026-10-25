const SpotifyWebApi = require('spotify-web-api-node');

let spotifyConfig;

function initialize(config) {
    spotifyConfig = {
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        redirectUri: config.redirectUri,
    };
}

function createClient() {
    if (!spotifyConfig) throw new Error('Spotify client factory has not been initialized');
    return new SpotifyWebApi(spotifyConfig);
}

module.exports = { initialize, createClient };
