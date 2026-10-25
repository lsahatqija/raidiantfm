const crypto = require('node:crypto');
const RefreshLease = require('../models/refresh-lease.model');
const spotifyFactory = require('../startup/spotify');
const userService = require('./user.service');
const sessionService = require('./session.service');
const { logger: defaultLogger } = require('./logger.service');

const REFRESH_SKEW_MS = 60_000;
const LEASE_MS = 10_000;
const WAIT_MS = 25;

class SpotifyAuthError extends Error {
    constructor(code, message, statusCode = 401) {
        super(message);
        this.name = 'SpotifyAuthError';
        this.code = code;
        this.statusCode = statusCode;
    }
}

function isUnauthorized(error) {
    return error?.statusCode === 401 || error?.status === 401;
}

function isInvalidGrant(error) {
    return error?.body?.error === 'invalid_grant'
        || error?.response?.body?.error === 'invalid_grant'
        || error?.response?.data?.error === 'invalid_grant';
}

function createSpotifyTokenService({
    createClient = spotifyFactory.createClient,
    users = userService,
    sessions = sessionService,
    leases = RefreshLease,
    now = () => new Date(),
    wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    logger = defaultLogger,
} = {}) {
    async function loadCredentials(userId) {
        const user = await users.findById(userId);
        if (!user?.spotifyCredentials) {
            throw new SpotifyAuthError('reauth_required', 'Spotify authorization is required');
        }
        return users.decryptSpotifyCredentials(user);
    }

    function clientFrom(credentials) {
        const client = createClient();
        client.setAccessToken(credentials.accessToken);
        client.setRefreshToken(credentials.refreshToken);
        return client;
    }

    async function acquireLease(userId, observedVersion) {
        const ownerId = crypto.randomUUID();
        const deadline = now().getTime() + LEASE_MS * 2;

        while (now().getTime() < deadline) {
            const acquired = await leases.findOneAndUpdate(
                { userId, expiresAt: { $lte: now() } },
                { $set: { ownerId, expiresAt: new Date(now().getTime() + LEASE_MS) } },
                { new: true },
            );
            if (acquired?.ownerId === ownerId) return { ownerId };

            try {
                await leases.create({ userId, ownerId, expiresAt: new Date(now().getTime() + LEASE_MS) });
                return { ownerId };
            } catch (error) {
                if (error?.code !== 11000) throw error;
            }

            await wait(WAIT_MS);
            const current = await loadCredentials(userId);
            if (current.version !== observedVersion) return { credentials: current };
        }

        throw new SpotifyAuthError('spotify_refresh_unavailable', 'Spotify authorization refresh is temporarily unavailable', 503);
    }

    async function refresh(userId, observedCredentials, operationLogger = logger) {
        operationLogger.info({ event: 'spotify_refresh_started', actorId: userId });
        const lease = await acquireLease(userId, observedCredentials.version);
        if (lease.credentials) return lease.credentials;

        try {
            const current = await loadCredentials(userId);
            if (current.version !== observedCredentials.version) return current;

            const client = clientFrom(current);
            let response;
            try {
                response = await client.refreshAccessToken();
            } catch (error) {
                if (isInvalidGrant(error)) {
                    await sessions.revokeAllForUser(userId);
                    operationLogger.warn({ event: 'spotify_refresh_reauthorization_required', actorId: userId });
                    throw new SpotifyAuthError('reauth_required', 'Spotify authorization has expired');
                }
                throw error;
            }

            const accessToken = response.body?.access_token;
            if (!accessToken) throw new Error('Spotify refresh response did not include an access token');
            const expiresIn = Number(response.body?.expires_in) || 3600;
            const replacement = await users.replaceSpotifyCredentials(userId, current.version, {
                accessToken,
                refreshToken: response.body?.refresh_token || current.refreshToken,
                tokenExpiresAt: new Date(now().getTime() + expiresIn * 1000),
            });

            operationLogger.info({ event: 'spotify_refresh_completed', actorId: userId });
            return replacement ? users.decryptSpotifyCredentials(replacement) : loadCredentials(userId);
        } finally {
            await leases.deleteOne({ userId, ownerId: lease.ownerId });
        }
    }

    async function usableCredentials(userId, operationLogger) {
        const credentials = await loadCredentials(userId);
        if (new Date(credentials.tokenExpiresAt).getTime() > now().getTime() + REFRESH_SKEW_MS) return credentials;
        return refresh(userId, credentials, operationLogger);
    }

    async function execute(userId, operation, operationLogger = logger) {
        let credentials = await usableCredentials(userId, operationLogger);
        try {
            return await operation(clientFrom(credentials));
        } catch (error) {
            if (!isUnauthorized(error)) throw error;
            credentials = await refresh(userId, credentials, operationLogger);
            return operation(clientFrom(credentials));
        }
    }

    async function getAccessToken(userId, operationLogger = logger) {
        const credentials = await usableCredentials(userId, operationLogger);
        return {
            accessToken: credentials.accessToken,
            expiresAt: new Date(credentials.tokenExpiresAt),
        };
    }

    return { execute, getAccessToken, refresh };
}

module.exports = { createSpotifyTokenService, SpotifyAuthError, isInvalidGrant };
