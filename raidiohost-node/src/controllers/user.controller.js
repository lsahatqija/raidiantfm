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
            location: {
                city: user.location?.city || '',
                consentAt: user.location?.consentAt || null,
            },
            lastVolume: typeof user.lastVolume === 'number' ? user.lastVolume : 0.5,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
        });
    } catch (err) {
        req.log?.error({ event: 'profile_fetch_failed', errorCode: err.code || err.name });
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
            lastVolume: typeof updated.lastVolume === 'number' ? updated.lastVolume : 0.5,
            updatedAt: updated.updatedAt,
        });
    } catch (err) {
        req.log?.error({ event: 'profile_update_failed', errorCode: err.code || err.name });
        const statusCode = err?.statusCode === 401 ? 401 : 500;
        return res.status(statusCode).json({ error: 'Error updating user profile' });
    }
}

/**
 * PATCH /api/users/me/location
 * Updates the user's geographic location.
 * Body: { city: string, consent: true }
 * Requires an application session.
 */
async function updateLocation(req, res) {
    const { city, consent } = req.body || {};

    if (typeof city !== 'string' || city.trim().length === 0) {
        return res.status(400).json({ error: 'city must be a non-empty string' });
    }
    try {
        const updated = await userService.updateLocationById(req.auth.userId, {
            city: city.trim(),
            consent,
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
        req.log?.error({ event: 'location_update_failed', errorCode: err.code || err.name });
        const statusCode = err?.statusCode === 401 ? 401 : 500;
        return res.status(statusCode).json({ error: 'Error updating location' });
    }
}

async function clearLocation(req, res) {
    try {
        const updated = await userService.clearLocationById(req.auth.userId);
        if (!updated) return res.status(404).json({ error: { code: 'not_found', message: 'User not found' } });
        return res.json({ location: { city: '', consentAt: null }, updatedAt: updated.updatedAt });
    } catch (error) {
        req.log?.error({ event: 'location_consent_withdrawal_failed', errorCode: error.code });
        return res.status(500).json({ error: { code: 'location_update_failed', message: 'Unable to remove location' } });
    }
}

async function exportAccount(req, res) {
    try {
        const data = await userService.exportAccountById(req.auth.userId);
        if (!data) return res.status(404).json({ error: { code: 'not_found', message: 'User not found' } });
        res.set('Cache-Control', 'no-store');
        res.set('Content-Disposition', 'attachment; filename="raidiantfm-account-export.json"');
        return res.json(data);
    } catch (error) {
        req.log?.error({ event: 'account_export_failed', errorCode: error.code });
        return res.status(500).json({ error: { code: 'account_export_failed', message: 'Unable to export account data' } });
    }
}

async function deleteAccount(req, res) {
    try {
        const deleted = await userService.deleteAccountById(req.auth.userId);
        if (!deleted) return res.status(404).json({ error: { code: 'not_found', message: 'User not found' } });
        req.log?.info({ event: 'account_deleted', actorId: req.auth.userId });
        const cookie = req.app.locals.sessionCookie;
        if (cookie?.name) {
            res.clearCookie(cookie.name, {
                httpOnly: cookie.httpOnly,
                secure: cookie.secure,
                sameSite: cookie.sameSite,
                path: '/',
            });
        }
        return res.status(204).end();
    } catch (error) {
        req.log?.error({ event: 'account_delete_failed', errorCode: error.code });
        return res.status(500).json({ error: { code: 'account_delete_failed', message: 'Unable to delete account' } });
    }
}

module.exports = { getMe, updateMe, updateLocation, clearLocation, exportAccount, deleteAccount };
