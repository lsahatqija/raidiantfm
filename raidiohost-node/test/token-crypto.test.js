const { createTokenCipher } = require('../src/services/token-crypto.service');

describe('token encryption', () => {
    const key = Buffer.alloc(32, 11);

    it('round-trips token material without storing the plaintext', () => {
        const cipher = createTokenCipher(key);
        const encrypted = cipher.encrypt('spotify-refresh-token');

        expect(encrypted).toEqual({
            ciphertext: expect.any(String),
            iv: expect.any(String),
            authTag: expect.any(String),
        });
        expect(JSON.stringify(encrypted)).not.toContain('spotify-refresh-token');
        expect(cipher.decrypt(encrypted)).toBe('spotify-refresh-token');
    });

    it('rejects decryption with a different key without leaking ciphertext details', () => {
        const encrypted = createTokenCipher(key).encrypt('spotify-refresh-token');
        const wrongCipher = createTokenCipher(Buffer.alloc(32, 12));

        expect(() => wrongCipher.decrypt(encrypted)).toThrow('Unable to decrypt Spotify token');
    });

    it('rejects invalid key sizes', () => {
        expect(() => createTokenCipher(Buffer.alloc(16))).toThrow(
            'Token encryption key must contain exactly 32 bytes',
        );
    });
});
