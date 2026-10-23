const crypto = require('node:crypto');
const User = require('../models/user.model');
const Topic = require('../models/topic.model');
const { createTokenCipher } = require('./token-crypto.service');

let tokenCipher;

function initializeTokenEncryption(key) {
    tokenCipher = createTokenCipher(key);
}

function getTokenCipher() {
    if (!tokenCipher) {
        throw new Error('Token encryption has not been initialized');
    }
    return tokenCipher;
}

function hashRefreshToken(refreshToken) {
    return crypto.createHash('sha256').update(refreshToken).digest('base64url');
}

function encryptSpotifyCredentials({ accessToken, refreshToken, tokenExpiresAt }) {
    const cipher = getTokenCipher();
    return {
        accessToken: cipher.encrypt(accessToken),
        refreshToken: cipher.encrypt(refreshToken),
        refreshTokenHash: hashRefreshToken(refreshToken),
        expiresAt: tokenExpiresAt,
        version: 0,
    };
}

function decryptSpotifyCredentials(user) {
    const cipher = getTokenCipher();
    const credentials = user.spotifyCredentials;
    return {
        accessToken: cipher.decrypt(credentials.accessToken),
        refreshToken: cipher.decrypt(credentials.refreshToken),
        tokenExpiresAt: credentials.expiresAt,
        version: credentials.version ?? 0,
    };
}

/**
 * Create or update the user document for a Spotify account.
 *
 * Spotify profile fields (spotifyDisplayName, spotifyEmail, tokens) are
 * always overwritten so they stay in sync with Spotify.
 * `username` is only set on document creation — once a user customises it,
 * subsequent logins will not revert it to the Spotify display name.
 *
 * @param {{ id: string, display_name?: string, email?: string }} spotifyProfile
 * @param {{ accessToken: string, refreshToken: string, tokenExpiresAt: Date }} tokens
 * @returns {Promise<import('../models/user.model')>}
 */
async function upsertUser(spotifyProfile, tokens) {
    const { id: spotifyId, display_name: spotifyDisplayName = '', email: spotifyEmail = '' } = spotifyProfile;

    // Always sync read-only Spotify fields and encrypted token data.
    const alwaysSet = {
        spotifyDisplayName,
        spotifyEmail,
        spotifyCredentials: encryptSpotifyCredentials(tokens),
    };

    // Only set username when the document does not yet exist (i.e. first login).
    const setOnInsert = {
        username: spotifyDisplayName || spotifyId,
    };

    const user = await User.findOneAndUpdate(
        { spotifyId },
        {
            $set: alwaysSet,
            $setOnInsert: setOnInsert,
            $unset: {
                accessToken: 1,
                refreshToken: 1,
                tokenExpiresAt: 1,
            },
        },
        { upsert: true, new: true, runValidators: true }
    );

    // On first creation, createdAt and updatedAt are identical.
    // Seed the new user's topics list with all enabled system topics.
    if (user.createdAt.getTime() === user.updatedAt.getTime()) {
        const systemTopics = await Topic.find({ isSystemTopic: true, enabled: true });
        if (systemTopics.length > 0) {
            user.topics = systemTopics.map((t) => ({
                topicId: t._id,
                enabled: true,
                priority: 1,
                preferredTone: 'casual',
            }));
            await user.save();
        }
    }

    return user;
}

/**
 * Find a user by their Spotify ID.
 * @param {string} spotifyId
 * @returns {Promise<import('../models/user.model') | null>}
 */
async function findBySpotifyId(spotifyId) {
    return User.findOne({ spotifyId });
}

/**
 * Update the mutable display username for a user.
 * @param {string} spotifyId
 * @param {string} newUsername
 * @returns {Promise<import('../models/user.model') | null>}
 */
async function updateUsername(spotifyId, newUsername) {
    return User.findOneAndUpdate(
        { spotifyId },
        { $set: { username: newUsername } },
        { new: true, runValidators: true }
    );
}

/**
 * Update mutable user profile fields.
 * @param {string} spotifyId
 * @param {{ username?: string, lastVolume?: number }} profileUpdates
 * @returns {Promise<import('../models/user.model') | null>}
 */
async function updateProfile(spotifyId, profileUpdates) {
    return User.findOneAndUpdate(
        { spotifyId },
        { $set: profileUpdates },
        { new: true, runValidators: true }
    );
}

/**
 * Find a user by their Spotify refresh token.
 * @param {string} refreshToken
 * @returns {Promise<import('../models/user.model') | null>}
 */
async function findByRefreshToken(refreshToken) {
    return User.findOne({
        'spotifyCredentials.refreshTokenHash': hashRefreshToken(refreshToken),
    });
}

/**
 * Update only the access token and its expiry for a user.
 * Called by the token-refresh interval in auth.routes.js.
 * @param {string} spotifyId
 * @param {{ accessToken: string, tokenExpiresAt: Date }} tokenData
 */
async function updateAccessToken(spotifyId, tokenData) {
    const encryptedAccessToken = getTokenCipher().encrypt(tokenData.accessToken);
    await User.findOneAndUpdate(
        { spotifyId },
        {
            $set: {
                'spotifyCredentials.accessToken': encryptedAccessToken,
                'spotifyCredentials.expiresAt': tokenData.tokenExpiresAt,
            },
            $inc: { 'spotifyCredentials.version': 1 },
            $unset: {
                accessToken: 1,
                refreshToken: 1,
                tokenExpiresAt: 1,
            },
        }
    );
}

/**
 * Update the user's geographic location.
 * @param {string} spotifyId
 * @param {{ city: string, latitude: number, longitude: number }} locationData
 * @returns {Promise<import('../models/user.model') | null>}
 */
async function updateLocation(spotifyId, locationData) {
    return User.findOneAndUpdate(
        { spotifyId },
        {
            $set: {
                'location.city': locationData.city,
                'location.latitude': locationData.latitude,
                'location.longitude': locationData.longitude,
            },
        },
        { new: true, runValidators: true }
    );
}

module.exports = {
    initializeTokenEncryption,
    encryptSpotifyCredentials,
    decryptSpotifyCredentials,
    upsertUser,
    findBySpotifyId,
    updateUsername,
    updateProfile,
    updateAccessToken,
    findByRefreshToken,
    updateLocation,
};
