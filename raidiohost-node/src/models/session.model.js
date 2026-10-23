const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        tokenHash: {
            type: String,
            required: true,
            unique: true,
            select: false,
        },
        createdAt: {
            type: Date,
            default: Date.now,
            immutable: true,
        },
        lastSeenAt: {
            type: Date,
            required: true,
        },
        absoluteExpiresAt: {
            type: Date,
            required: true,
        },
        revokedAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: { createdAt: false, updatedAt: true },
        toJSON: {
            transform(_document, result) {
                delete result.tokenHash;
                return result;
            },
        },
    },
);

sessionSchema.index({ absoluteExpiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Session', sessionSchema);
