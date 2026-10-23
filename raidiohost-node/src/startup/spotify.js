const SpotifyWebApi = require('spotify-web-api-node');

const spotifyApi = new SpotifyWebApi();

spotifyApi.initialize = function initialize(spotifyConfig) {
    spotifyApi.setClientId(spotifyConfig.clientId);
    spotifyApi.setClientSecret(spotifyConfig.clientSecret);
    spotifyApi.setRedirectURI(spotifyConfig.redirectUri);
};

module.exports = spotifyApi;
