const crypto = require('node:crypto');
const Session = require('../models/session.model');

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
let sessionSecret;

function initialize(secret) { sessionSecret = secret; }
function hashToken(token) {
    if (!sessionSecret) throw new Error('Session service has not been initialized');
    return crypto.createHmac('sha256', sessionSecret).update(token).digest('base64url');
}
async function create(userId) {
    const token = crypto.randomBytes(32).toString('base64url');
    const now = new Date();
    await Session.create({ userId, tokenHash: hashToken(token), lastSeenAt: now, absoluteExpiresAt: new Date(now.getTime() + THIRTY_DAYS) });
    return token;
}
async function resolve(token) {
    if (!token) return null;
    return Session.findOneAndUpdate(
        { tokenHash: hashToken(token), revokedAt: null, absoluteExpiresAt: { $gt: new Date() } },
        { $set: { lastSeenAt: new Date() } },
        { new: true },
    ).populate('userId');
}
async function revoke(token) {
    if (!token) return false;
    const result = await Session.updateOne({ tokenHash: hashToken(token), revokedAt: null }, { $set: { revokedAt: new Date() } });
    return result.modifiedCount === 1;
}

async function revokeAllForUser(userId) {
    const result = await Session.updateMany(
        { userId, revokedAt: null },
        { $set: { revokedAt: new Date() } },
    );
    return result.modifiedCount;
}

module.exports = { initialize, create, resolve, revoke, revokeAllForUser };
