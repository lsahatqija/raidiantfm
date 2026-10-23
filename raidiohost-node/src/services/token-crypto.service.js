const crypto = require('node:crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

function createTokenCipher(key) {
    if (!Buffer.isBuffer(key) || key.length !== 32) {
        throw new Error('Token encryption key must contain exactly 32 bytes');
    }

    function encrypt(plaintext) {
        const iv = crypto.randomBytes(IV_BYTES);
        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
        const ciphertext = Buffer.concat([
            cipher.update(plaintext, 'utf8'),
            cipher.final(),
        ]);

        return {
            ciphertext: ciphertext.toString('base64'),
            iv: iv.toString('base64'),
            authTag: cipher.getAuthTag().toString('base64'),
        };
    }

    function decrypt(encrypted) {
        try {
            const decipher = crypto.createDecipheriv(
                ALGORITHM,
                key,
                Buffer.from(encrypted.iv, 'base64'),
            );
            decipher.setAuthTag(Buffer.from(encrypted.authTag, 'base64'));
            return Buffer.concat([
                decipher.update(Buffer.from(encrypted.ciphertext, 'base64')),
                decipher.final(),
            ]).toString('utf8');
        } catch {
            throw new Error('Unable to decrypt Spotify token');
        }
    }

    return { encrypt, decrypt };
}

module.exports = { createTokenCipher };
