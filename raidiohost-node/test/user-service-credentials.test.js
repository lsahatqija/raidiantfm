const crypto = require('node:crypto');
const User = require('../src/models/user.model');
const Topic = require('../src/models/topic.model');
const userService = require('../src/services/user.service');

describe('user service Spotify credentials', () => {
    beforeEach(() => {
        userService.initializeTokenEncryption(Buffer.alloc(32, 21));
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('encrypts tokens and removes legacy plaintext fields during login upsert', async () => {
        const now = new Date('2026-10-23T12:00:00.000Z');
        const persistedUser = {
            createdAt: new Date('2026-10-22T12:00:00.000Z'),
            updatedAt: now,
        };
        const updateSpy = vi.spyOn(User, 'findOneAndUpdate').mockResolvedValue(persistedUser);

        await userService.upsertUser(
            { id: 'spotify-user', display_name: 'Test User', email: 'test@example.invalid' },
            {
                accessToken: 'raw-access-token',
                refreshToken: 'raw-refresh-token',
                tokenExpiresAt: now,
            },
        );

        const update = updateSpy.mock.calls[0][1];
        expect(update.$unset).toEqual({
            accessToken: 1,
            refreshToken: 1,
            tokenExpiresAt: 1,
        });
        expect(JSON.stringify(update.$set.spotifyCredentials)).not.toContain('raw-access-token');
        expect(JSON.stringify(update.$set.spotifyCredentials)).not.toContain('raw-refresh-token');
        expect(update.$set.spotifyCredentials.refreshTokenHash).toBe(
            crypto.createHash('sha256').update('raw-refresh-token').digest('base64url'),
        );
    });

    it('finds a user through a one-way refresh-token fingerprint', async () => {
        const findSpy = vi.spyOn(User, 'findOne').mockResolvedValue(null);

        await userService.findByRefreshToken('raw-refresh-token');

        expect(findSpy).toHaveBeenCalledWith({
            'spotifyCredentials.refreshTokenHash': crypto
                .createHash('sha256')
                .update('raw-refresh-token')
                .digest('base64url'),
        });
    });

    it('decrypts credentials only through the explicit server-side accessor', () => {
        const encrypted = userService.encryptSpotifyCredentials({
            accessToken: 'raw-access-token',
            refreshToken: 'raw-refresh-token',
            tokenExpiresAt: new Date('2026-10-23T12:00:00.000Z'),
        });

        expect(userService.decryptSpotifyCredentials({ spotifyCredentials: encrypted })).toEqual({
            accessToken: 'raw-access-token',
            refreshToken: 'raw-refresh-token',
            tokenExpiresAt: new Date('2026-10-23T12:00:00.000Z'),
            version: 0,
        });
    });

    it('does not seed topics for an existing user', async () => {
        vi.spyOn(User, 'findOneAndUpdate').mockResolvedValue({
            createdAt: new Date('2026-10-22T12:00:00.000Z'),
            updatedAt: new Date('2026-10-23T12:00:00.000Z'),
        });
        const topicSpy = vi.spyOn(Topic, 'find');

        await userService.upsertUser(
            { id: 'spotify-user', display_name: 'Test User' },
            {
                accessToken: 'raw-access-token',
                refreshToken: 'raw-refresh-token',
                tokenExpiresAt: new Date('2026-10-23T12:00:00.000Z'),
            },
        );

        expect(topicSpy).not.toHaveBeenCalled();
    });
});
