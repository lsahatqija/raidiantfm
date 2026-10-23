const { createSpotifyTokenService } = require('../src/services/spotify-token.service');

function createHarness({ invalidGrant = false } = {}) {
    const credentials = new Map([
        ['user-a', { accessToken: 'access-a', refreshToken: 'refresh-a', tokenExpiresAt: new Date(Date.now() + 120_000), version: 0 }],
        ['user-b', { accessToken: 'access-b', refreshToken: 'refresh-b', tokenExpiresAt: new Date(Date.now() + 120_000), version: 0 }],
    ]);
    let lease = null;
    let refreshCalls = 0;
    const revoked = [];

    const users = {
        findById: vi.fn(async (userId) => ({ spotifyCredentials: true, userId })),
        decryptSpotifyCredentials: vi.fn((user) => ({ ...credentials.get(user.userId) })),
        replaceSpotifyCredentials: vi.fn(async (userId, expectedVersion, next) => {
            const current = credentials.get(userId);
            if (current.version !== expectedVersion) return null;
            credentials.set(userId, { ...next, version: expectedVersion + 1 });
            return { spotifyCredentials: true, userId };
        }),
    };
    const leases = {
        findOneAndUpdate: vi.fn(async ({ userId, expiresAt }) => {
            if (lease?.userId === userId && lease.expiresAt <= expiresAt.$lte) {
                lease = { userId, ownerId: 'taken-over', expiresAt: new Date(Date.now() + 10_000) };
                return lease;
            }
            return null;
        }),
        create: vi.fn(async (next) => {
            if (lease?.userId === next.userId) {
                const error = new Error('duplicate');
                error.code = 11000;
                throw error;
            }
            lease = next;
            return next;
        }),
        deleteOne: vi.fn(async ({ userId, ownerId }) => {
            if (lease?.userId === userId && lease.ownerId === ownerId) lease = null;
        }),
    };
    const createClient = vi.fn(() => {
        const state = {};
        return {
            setAccessToken: (token) => { state.accessToken = token; },
            setRefreshToken: (token) => { state.refreshToken = token; },
            refreshAccessToken: async () => {
                refreshCalls += 1;
                await new Promise((resolve) => setTimeout(resolve, 5));
                if (invalidGrant) {
                    const error = new Error('expired');
                    error.body = { error: 'invalid_grant' };
                    throw error;
                }
                return { body: { access_token: `renewed-${state.refreshToken}`, expires_in: 3600, refresh_token: `rotated-${state.refreshToken}` } };
            },
            identity: () => state.accessToken,
        };
    });
    const sessions = { revokeAllForUser: vi.fn(async (userId) => { revoked.push(userId); }) };
    const service = createSpotifyTokenService({ createClient, users, sessions, leases });
    return { service, credentials, revoked, users, sessions, leases, createClient, getRefreshCalls: () => refreshCalls };
}

describe('request-scoped Spotify token service', () => {
    it('keeps parallel users on independent client credentials', async () => {
        const { service } = createHarness();
        const [a, b] = await Promise.all([
            service.execute('user-a', async (client) => client.identity()),
            service.execute('user-b', async (client) => client.identity()),
        ]);
        expect([a, b]).toEqual(['access-a', 'access-b']);
    });

    it('coordinates refresh across service instances and atomically keeps a rotated refresh token', async () => {
        const harness = createHarness();
        harness.credentials.get('user-a').tokenExpiresAt = new Date(0);
        const restartedService = createSpotifyTokenService({
            createClient: harness.createClient,
            users: harness.users,
            sessions: harness.sessions,
            leases: harness.leases,
        });

        const [a, b] = await Promise.all([
            restartedService.execute('user-a', async (client) => client.identity()),
            harness.service.execute('user-a', async (client) => client.identity()),
        ]);

        expect(a).toBe('renewed-refresh-a');
        expect(b).toBe('renewed-refresh-a');
        expect(harness.getRefreshCalls()).toBe(1);
        expect(harness.credentials.get('user-a')).toMatchObject({
            refreshToken: 'rotated-refresh-a',
            version: 1,
        });
    });

    it('refreshes and retries a Spotify 401 exactly once', async () => {
        const harness = createHarness();
        let calls = 0;
        const result = await harness.service.execute('user-a', async (client) => {
            calls += 1;
            if (calls === 1) throw Object.assign(new Error('expired access token'), { statusCode: 401 });
            return client.identity();
        });
        expect(result).toBe('renewed-refresh-a');
        expect(calls).toBe(2);
        expect(harness.getRefreshCalls()).toBe(1);
    });

    it('maps invalid_grant to reauth_required and revokes only that user sessions', async () => {
        const harness = createHarness({ invalidGrant: true });
        harness.credentials.get('user-a').tokenExpiresAt = new Date(0);
        await expect(harness.service.execute('user-a', () => null)).rejects.toMatchObject({
            code: 'reauth_required',
            statusCode: 401,
        });
        expect(harness.revoked).toEqual(['user-a']);
    });
});
