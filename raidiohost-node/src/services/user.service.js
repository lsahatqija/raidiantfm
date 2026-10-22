const User = require('../models/user.model');
const Topic = require('../models/topic.model');

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

    // Always sync read-only Spotify fields and token data.
    const alwaysSet = {
        spotifyDisplayName,
        spotifyEmail,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt: tokens.tokenExpiresAt,
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
    return User.findOne({ refreshToken });
}

/**
 * Update only the access token and its expiry for a user.
 * Called by the token-refresh interval in auth.routes.js.
 * @param {string} spotifyId
 * @param {{ accessToken: string, tokenExpiresAt: Date }} tokenData
 */
async function updateAccessToken(spotifyId, tokenData) {
    await User.findOneAndUpdate(
        { spotifyId },
        {
            $set: {
                accessToken: tokenData.accessToken,
                tokenExpiresAt: tokenData.tokenExpiresAt,
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
    upsertUser,
    findBySpotifyId,
    updateUsername,
    updateProfile,
    updateAccessToken,
    findByRefreshToken,
    updateLocation,
};
