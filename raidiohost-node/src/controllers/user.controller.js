const userService = require('../services/user.service');

/**
 * GET /api/users/me
 * Returns the current user's document from the database.
 * Requires an application session.
 */
async function getMe(req, res) {
    try {
        const user = await userService.findById(req.auth.userId);

        if (!user) {
            return res.status(404).json({ error: 'User not found. Log in via Spotify to create your profile.' });
        }

        return res.json({
            spotifyId: user.spotifyId,
            username: user.username,
            spotifyDisplayName: user.spotifyDisplayName,
            spotifyEmail: user.spotifyEmail,
            location: user.location ?? { city: '', latitude: null, longitude: null },
            lastVolume: typeof user.lastVolume === 'number' ? user.lastVolume : 0.5,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
        });
    } catch (err) {
        console.error('Error in getMe:', err);
        const statusCode = err?.statusCode === 401 ? 401 : 500;
        return res.status(statusCode).json({ error: 'Error fetching user profile' });
    }
}

/**
 * PATCH /api/users/me
 * Updates the mutable display username for the current user.
 * Body: { username: string }
 * Requires an application session.
 */
async function updateMe(req, res) {
    const { username, lastVolume } = req.body || {};
    const updates = {};

    if (typeof username !== 'undefined') {
        if (typeof username !== 'string' || username.trim().length === 0) {
            return res.status(400).json({ error: 'username must be a non-empty string' });
        }

        if (username.trim().length > 64) {
            return res.status(400).json({ error: 'username must be 64 characters or fewer' });
        }

        updates.username = username.trim();
    }

    if (typeof lastVolume !== 'undefined') {
        if (typeof lastVolume !== 'number' || Number.isNaN(lastVolume) || lastVolume < 0 || lastVolume > 1) {
            return res.status(400).json({ error: 'lastVolume must be a number between 0 and 1' });
        }

        updates.lastVolume = lastVolume;
    }

    if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No valid profile fields provided' });
    }

    try {
        const updated = await userService.updateProfileById(req.auth.userId, updates);

        if (!updated) {
            return res.status(404).json({ error: 'User not found. Log in via Spotify to create your profile.' });
        }

        return res.json({
            spotifyId: updated.spotifyId,
            username: updated.username,
            spotifyDisplayName: updated.spotifyDisplayName,
            spotifyEmail: updated.spotifyEmail,
            lastVolume: typeof updated.lastVolume === 'number' ? updated.lastVolume : 0.5,
            updatedAt: updated.updatedAt,
        });
    } catch (err) {
        console.error('Error in updateMe:', err);
        const statusCode = err?.statusCode === 401 ? 401 : 500;
        return res.status(statusCode).json({ error: 'Error updating user profile' });
    }
}

/**
 * PATCH /api/users/me/location
 * Updates the user's geographic location.
 * Body: { city: string, latitude: number, longitude: number }
 * Requires an application session.
 */
async function updateLocation(req, res) {
    const { city, latitude, longitude } = req.body || {};

    if (typeof city !== 'string' || city.trim().length === 0) {
        return res.status(400).json({ error: 'city must be a non-empty string' });
    }
    if (typeof latitude !== 'number' || latitude < -90 || latitude > 90) {
        return res.status(400).json({ error: 'latitude must be a number between -90 and 90' });
    }
    if (typeof longitude !== 'number' || longitude < -180 || longitude > 180) {
        return res.status(400).json({ error: 'longitude must be a number between -180 and 180' });
    }

    try {
        const updated = await userService.updateLocationById(req.auth.userId, {
            city: city.trim(),
            latitude,
            longitude,
        });

        if (!updated) {
            return res.status(404).json({ error: 'User not found. Log in via Spotify to create your profile.' });
        }

        return res.json({
            spotifyId: updated.spotifyId,
            location: updated.location,
            updatedAt: updated.updatedAt,
        });
    } catch (err) {
        console.error('Error in updateLocation:', err);
        const statusCode = err?.statusCode === 401 ? 401 : 500;
        return res.status(statusCode).json({ error: 'Error updating location' });
    }
}

module.exports = { getMe, updateMe, updateLocation };
