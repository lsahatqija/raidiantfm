const crypto = require('node:crypto');
const RateLimit = require('../models/rate-limit.model');

function createMongoRateLimitStore() {
    return {
        async increment(key, windowMs, now = Date.now()) {
            const bucket = Math.floor(now / windowMs);
            const id = crypto.createHash('sha256').update(`${key}:${bucket}`).digest('base64url');
            const record = await RateLimit.findByIdAndUpdate(id, {
                $inc: { count: 1 },
                $setOnInsert: { expiresAt: new Date((bucket + 1) * windowMs) },
            }, { upsert: true, new: true, setDefaultsOnInsert: true });
            return record.count;
        },
    };
}

function createRateLimiter({
    store = createMongoRateLimitStore(),
    name,
    max,
    windowMs,
    keyGenerator = (request) => request.auth?.userId || request.ip,
}) {
    return async function rateLimiter(request, response, next) {
        try {
            const rawKey = `${name}:${keyGenerator(request) || 'unknown'}`;
            const count = await store.increment(rawKey, windowMs);
            response.set('RateLimit-Limit', String(max));
            response.set('RateLimit-Remaining', String(Math.max(0, max - count)));
            if (count > max) {
                const retryAfter = Math.ceil(windowMs / 1000);
                response.set('Retry-After', String(retryAfter));
                return response.status(429).json({
                    error: { code: 'rate_limited', message: 'Too many requests; try again later' },
                });
            }
            return next();
        } catch (error) {
            return next(error);
        }
    };
}

module.exports = { createMongoRateLimitStore, createRateLimiter };
