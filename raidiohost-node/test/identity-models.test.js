const mongoose = require('mongoose');
const User = require('../src/models/user.model');
const Session = require('../src/models/session.model');
const OAuthTransaction = require('../src/models/oauth-transaction.model');
const RefreshLease = require('../src/models/refresh-lease.model');

function hasTtlIndex(model, field) {
    return model.schema.indexes().some(([keys, options]) => keys[field] === 1 && options.expireAfterSeconds === 0);
}

describe('identity storage models', () => {
    it('stores encrypted Spotify credential envelopes and omits them from serialization', () => {
        expect(User.schema.path('accessToken')).toBeUndefined();
        expect(User.schema.path('refreshToken')).toBeUndefined();

        const user = new User({
            spotifyId: 'spotify-user',
            username: 'Test User',
            spotifyCredentials: {
                accessToken: {
                    ciphertext: 'ciphertext',
                    iv: 'initialization-vector',
                    authTag: 'authentication-tag',
                },
                refreshToken: {
                    ciphertext: 'ciphertext',
                    iv: 'initialization-vector',
                    authTag: 'authentication-tag',
                },
                refreshTokenHash: 'one-way-fingerprint',
                expiresAt: new Date('2027-01-01T00:00:00.000Z'),
            },
        });

        expect(user.toJSON()).not.toHaveProperty('spotifyCredentials');
        expect(JSON.stringify(user)).not.toContain('ciphertext');
    });

    it('defines opaque sessions with ownership, activity, expiry, and revocation fields', () => {
        const session = new Session({
            userId: new mongoose.Types.ObjectId(),
            tokenHash: 'opaque-session-hash',
            lastSeenAt: new Date('2026-10-23T10:00:00.000Z'),
            absoluteExpiresAt: new Date('2026-11-22T10:00:00.000Z'),
        });

        expect(session.createdAt).toBeDefined();
        expect(session.lastSeenAt).toBeInstanceOf(Date);
        expect(session.absoluteExpiresAt).toBeInstanceOf(Date);
        expect(session.revokedAt).toBeNull();
        expect(session.toJSON()).not.toHaveProperty('tokenHash');
        expect(hasTtlIndex(Session, 'absoluteExpiresAt')).toBe(true);
    });

    it('expires OAuth transactions automatically and keeps state hashes private', () => {
        const transaction = new OAuthTransaction({
            stateHash: 'oauth-state-hash',
            returnTo: '/',
            expiresAt: new Date('2026-10-23T10:10:00.000Z'),
        });

        expect(transaction.toJSON()).not.toHaveProperty('stateHash');
        expect(hasTtlIndex(OAuthTransaction, 'expiresAt')).toBe(true);
    });

    it('expires per-user refresh leases automatically', () => {
        expect(RefreshLease.schema.path('userId').options.unique).toBe(true);
        expect(hasTtlIndex(RefreshLease, 'expiresAt')).toBe(true);
    });
});
