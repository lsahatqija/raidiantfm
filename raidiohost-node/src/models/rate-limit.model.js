const mongoose = require('mongoose');

const rateLimitSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    count: { type: Number, required: true, default: 0 },
    expiresAt: { type: Date, required: true },
}, { versionKey: false });

rateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('RateLimit', rateLimitSchema);
