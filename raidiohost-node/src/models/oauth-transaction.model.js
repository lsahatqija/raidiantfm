const mongoose = require('mongoose');

const oauthTransactionSchema = new mongoose.Schema(
    {
        stateHash: {
            type: String,
            required: true,
            unique: true,
            select: false,
        },
        returnTo: {
            type: String,
            required: true,
            default: '/',
        },
        expiresAt: {
            type: Date,
            required: true,
        },
    },
    {
        timestamps: true,
        toJSON: {
            transform(_document, result) {
                delete result.stateHash;
                return result;
            },
        },
    },
);

oauthTransactionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('OAuthTransaction', oauthTransactionSchema);
