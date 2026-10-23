const crypto = require('node:crypto');
const OAuthTransaction = require('../models/oauth-transaction.model');

const TEN_MINUTES = 10 * 60 * 1000;
let stateSecret;

function initialize(secret) { stateSecret = secret; }
function hashState(state) {
    if (!stateSecret) throw new Error('OAuth transaction service has not been initialized');
    return crypto.createHmac('sha256', stateSecret).update(state).digest('base64url');
}
async function create(returnTo = '/') {
    const state = crypto.randomBytes(32).toString('base64url');
    await OAuthTransaction.create({ stateHash: hashState(state), returnTo, expiresAt: new Date(Date.now() + TEN_MINUTES) });
    return state;
}
async function consume(state) {
    if (!state) return null;
    return OAuthTransaction.findOneAndDelete({ stateHash: hashState(state), expiresAt: { $gt: new Date() } });
}

module.exports = { initialize, create, consume };
