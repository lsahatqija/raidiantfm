const TONES = ['casual', 'serious', 'happy', 'sad', 'curious', 'urgent', 'optimistic', 'professional'];
const PERSONALITIES = ['calm', 'smooth', 'deep', 'energetic', 'cool', 'witty', 'serious', 'playful', 'sardonic'];

function issue(field, message) {
    return { field, message };
}

function validationError(response, details) {
    return response.status(422).json({
        error: { code: 'validation_error', message: 'Request input is invalid', details },
    });
}

function validate(validator) {
    return function validationMiddleware(request, response, next) {
        const details = validator(request);
        return details.length ? validationError(response, details) : next();
    };
}

function boundedString(value, field, { min = 0, max, optional = false } = {}) {
    if (value == null && optional) return [];
    if (typeof value !== 'string') return [issue(field, 'must be a string')];
    const length = value.trim().length;
    if (length < min || length > max) return [issue(field, `must contain ${min} to ${max} characters`)];
    return [];
}

function pagination(query, maxLimit = 50) {
    const details = [];
    if (query.limit !== undefined && (!/^\d+$/.test(`${query.limit}`) || Number(query.limit) < 1 || Number(query.limit) > maxLimit)) {
        details.push(issue('limit', `must be an integer from 1 to ${maxLimit}`));
    }
    if (query.offset !== undefined && (!/^\d+$/.test(`${query.offset}`) || Number(query.offset) < 0 || Number(query.offset) > 10_000)) {
        details.push(issue('offset', 'must be an integer from 0 to 10000'));
    }
    return details;
}

const validators = {
    oauthCallback: validate(({ query }) => {
        const details = boundedString(query.state, 'state', { min: 1, max: 512 });
        details.push(...boundedString(query.code, 'code', { min: 1, max: 2048, optional: true }));
        details.push(...boundedString(query.error, 'error', { min: 1, max: 128, optional: true }));
        if (!query.code && !query.error) details.push(issue('code', 'or error is required'));
        return details;
    }),
    search: validate(({ query }) => [
        ...boundedString(query.q, 'q', { min: 1, max: 200 }),
        ...pagination(query, 50),
    ]),
    pagination: validate(({ query }) => pagination(query)),
    playlist: validate(({ params, query }) => [
        ...boundedString(params.id, 'id', { min: 1, max: 100 }),
        ...pagination(query),
    ]),
    play: validate(({ query }) => {
        const details = boundedString(query.uri, 'uri', { min: 1, max: 200 });
        if (typeof query.uri === 'string' && !/^spotify:(track|episode):[A-Za-z0-9]+$/.test(query.uri)) {
            details.push(issue('uri', 'must be a Spotify track or episode URI'));
        }
        return details.concat(boundedString(query.device_id, 'device_id', { min: 1, max: 200, optional: true }));
    }),
    geocode: validate(({ query }) => boundedString(query.q, 'q', { min: 2, max: 100 })),
    queue: validate(({ body }) => {
        if (!body || typeof body !== 'object' || Array.isArray(body)) return [issue('body', 'must be an object')];
        const track = body.track || body;
        const details = [];
        if (track.uri !== undefined) details.push(...boundedString(track.uri, 'track.uri', { min: 1, max: 200 }));
        if (track.id !== undefined) details.push(...boundedString(track.id, 'track.id', { min: 1, max: 100 }));
        if (body.recentTracks !== undefined && (!Array.isArray(body.recentTracks) || body.recentTracks.length > 50)) {
            details.push(issue('recentTracks', 'must be an array with at most 50 entries'));
        }
        return details;
    }),
    profile: validate(({ body }) => {
        if (!body || typeof body !== 'object' || Array.isArray(body)) return [issue('body', 'must be an object')];
        const details = [];
        const keys = Object.keys(body);
        if (!keys.length || keys.some((key) => !['username', 'lastVolume'].includes(key))) details.push(issue('body', 'contains unsupported fields'));
        if (body.username !== undefined) details.push(...boundedString(body.username, 'username', { min: 1, max: 64 }));
        if (body.lastVolume !== undefined && (typeof body.lastVolume !== 'number' || !Number.isFinite(body.lastVolume) || body.lastVolume < 0 || body.lastVolume > 1)) {
            details.push(issue('lastVolume', 'must be a number from 0 to 1'));
        }
        return details;
    }),
    location: validate(({ body }) => {
        if (!body || typeof body !== 'object' || Array.isArray(body)) return [issue('body', 'must be an object')];
        const details = boundedString(body.city, 'city', { min: 1, max: 160 });
        if (body.consent !== true) details.push(issue('consent', 'must be explicitly accepted'));
        if (Object.keys(body).some((key) => !['city', 'consent'].includes(key))) details.push(issue('body', 'contains unsupported fields'));
        return details;
    }),
    deletion: validate(({ body }) => (
        body?.confirmation === 'DELETE' && Object.keys(body).length === 1
            ? []
            : [issue('confirmation', 'must equal DELETE')]
    )),
    topic: validate(({ body }) => {
        if (!body || typeof body !== 'object' || Array.isArray(body)) return [issue('body', 'must be an object')];
        const details = boundedString(body.name, 'name', { min: 1, max: 128 });
        details.push(...boundedString(body.description, 'description', { min: 0, max: 2000, optional: true }));
        if (body.category !== undefined && !['news', 'technology', 'gaming', 'music', 'sports', 'local', 'entertainment', 'custom'].includes(body.category)) {
            details.push(issue('category', 'is not supported'));
        }
        if (!Array.isArray(body.sources) || body.sources.length > 5) {
            details.push(issue('sources', 'must be an array with at most 5 entries'));
        } else {
            body.sources.forEach((source, index) => {
                try {
                    const url = new URL(source);
                    if (!['http:', 'https:'].includes(url.protocol) || source.length > 2048 || url.username || url.password) throw new Error();
                } catch {
                    details.push(issue(`sources.${index}`, 'must be an HTTP(S) URL without credentials'));
                }
            });
        }
        return details;
    }),
    subscription: validate(({ params, body }) => {
        const details = boundedString(params.topicId, 'topicId', { min: 1, max: 64 });
        if (body?.priority !== undefined && (!Number.isInteger(body.priority) || body.priority < 1 || body.priority > 10)) details.push(issue('priority', 'must be an integer from 1 to 10'));
        if (body?.preferredTone !== undefined && !TONES.includes(body.preferredTone)) details.push(issue('preferredTone', 'is not supported'));
        return details;
    }),
    hostBlurb: validate(({ body }) => {
        if (!body || typeof body !== 'object' || Array.isArray(body)) return [issue('body', 'must be an object')];
        const details = [];
        for (const field of ['previousTrack', 'nextTrack']) {
            if (body[field] !== undefined && (typeof body[field] !== 'object' || Array.isArray(body[field]))) details.push(issue(field, 'must be an object'));
            else if (body[field]) {
                details.push(...boundedString(body[field].name, `${field}.name`, { min: 0, max: 200, optional: true }));
                details.push(...boundedString(body[field].artist, `${field}.artist`, { min: 0, max: 200, optional: true }));
            }
        }
        if (body.weatherUnits !== undefined && !['metric', 'imperial'].includes(body.weatherUnits)) details.push(issue('weatherUnits', 'must be metric or imperial'));
        if (body.hostPersonality !== undefined && !PERSONALITIES.includes(body.hostPersonality)) details.push(issue('hostPersonality', 'is not supported'));
        return details;
    }),
};

module.exports = { validators, validationError };
