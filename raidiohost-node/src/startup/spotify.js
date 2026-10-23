const SpotifyWebApi = require('spotify-web-api-node');

const spotifyApi = new SpotifyWebApi();

spotifyApi.initialize = function initialize(spotifyConfig) {
    this.spotifyConfig = spotifyConfig;
    spotifyApi.setClientId(spotifyConfig.clientId);
    spotifyApi.setClientSecret(spotifyConfig.clientSecret);
    spotifyApi.setRedirectURI(spotifyConfig.redirectUri);
};

spotifyApi.createClient = function createClient() {
    if (!this.spotifyConfig) throw new Error('Spotify client has not been initialized');
    return new SpotifyWebApi(this.spotifyConfig);
};

module.exports = spotifyApi;
