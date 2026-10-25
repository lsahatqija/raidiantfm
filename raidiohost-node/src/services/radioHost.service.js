const User = require('../models/user.model');
const { fetchRssUrl } = require('./rss.service');
const { TONE_TEMPLATES } = require('./toneTemplates');
const { createSafeHttpClient } = require('./outbound-http.service');

const outboundHttp = createSafeHttpClient();

const FALLBACK_TEXT = "No major updates queued right now, so let's keep the playlist rolling.";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Return a random element from an array. */
function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Pick a tone for a single blurb part.
 * If the user has a preferredTone override, always use that.
 * Otherwise pick at random from the topic's tones array.
 * Falls back to 'casual' when neither is set.
 */
function pickTone(topic, preferredTone) {
    if (preferredTone) return preferredTone;
    const tones = topic.tones && topic.tones.length > 0 ? topic.tones : ['casual'];
    return pickRandom(tones);
}

/** Normalize weather units to supported values. */
function normalizeWeatherUnits(units) {
    return units === 'imperial' ? 'imperial' : 'metric';
}

/**
 * Interpolate {city}, {lat}, {lon} placeholders in source URLs using user location.
 * URLs that contain a placeholder whose value is absent are dropped entirely.
 * Static URLs (no placeholders) are returned unchanged.
 * @param {string[]} sources
 * @param {{ city?: string, latitude?: number, longitude?: number }|null} loc
 * @returns {string[]}
 */
function interpolateSources(sources, loc) {
    return (sources || []).flatMap((url) => {
        const needsCity = url.includes('{city}');
        const needsLat = url.includes('{lat}');
        const needsLon = url.includes('{lon}');

        if (needsCity && !loc?.city) return [];
        if (needsLat && (loc?.latitude == null)) return [];
        if (needsLon && (loc?.longitude == null)) return [];

        return [
            url
                .replace('{city}', needsCity ? encodeURIComponent(loc.city) : '')
                .replace('{lat}', needsLat ? loc.latitude : '')
                .replace('{lon}', needsLon ? loc.longitude : ''),
        ];
    });
}

/**
 * Fetch current + short-term forecast weather from wttr.in.
 * Returns a compact set of blurb-ready entries for now, later today, and next days.
 * @param {string} city
 * @param {'metric'|'imperial'} [units='metric']
 * @returns {Promise<Array<{ title: string, url: string, publishedAt: Date }>>}
 */
async function fetchWttrIn(city, units = 'metric') {
    try {
        const encoded = encodeURIComponent(city);
        const url = `https://wttr.in/${encoded}?format=j1`;
        const raw = await outboundHttp.get(url, {
            allowedProtocols: ['https:'],
            allowedHosts: ['wttr.in'],
            allowedContentTypes: ['application/json'],
            connectTimeoutMs: 3_000,
            readTimeoutMs: 5_000,
            maxBytes: 500_000,
            maxRedirects: 0,
        });
        const data = JSON.parse(raw.toString('utf8'));
                    const cur = data.current_condition?.[0];
                    const days = data.weather || [];
                    const today = days[0];
                    if (!cur) return [];

                    const selectedUnits = normalizeWeatherUnits(units);
                    const isMetric = selectedUnits === 'metric';
                    const symbol = isMetric ? 'C' : 'F';
                    const getTempForUnits = (obj, metricKey, imperialKey) =>
                        isMetric ? (obj?.[metricKey] ?? '?') : (obj?.[imperialKey] ?? '?');
                    const toHour = (timeValue) => {
                        const num = Number(timeValue);
                        if (!Number.isFinite(num)) return null;
                        return Math.floor(num / 100);
                    };

                    const items = [];
                    const now = new Date();

                    const descNow = cur.weatherDesc?.[0]?.value ?? 'conditions unknown';
                    const tempNow = getTempForUnits(cur, 'temp_C', 'temp_F');
                    const maxToday = getTempForUnits(today, 'maxtempC', 'maxtempF');
                    const minToday = getTempForUnits(today, 'mintempC', 'mintempF');
                    items.push({
                        title: `${city} now: ${descNow}, ${tempNow}°${symbol}. Today's high ${maxToday}°${symbol}, low ${minToday}°${symbol}.`,
                        url: `https://wttr.in/${encoded}`,
                        publishedAt: now,
                    });

                    // Include a later-today snapshot when a future hourly slot exists.
                    const nowHour = now.getHours();
                    const nextHourly = (today?.hourly || []).find((h) => {
                        const hour = toHour(h.time);
                        return hour != null && hour > nowHour;
                    });
                    if (nextHourly) {
                        const slotHour = toHour(nextHourly.time);
                        const slotLabel = slotHour == null ? 'later today' : `around ${String(slotHour).padStart(2, '0')}:00`;
                        const slotDesc = nextHourly.weatherDesc?.[0]?.value ?? 'conditions unknown';
                        const slotTemp = getTempForUnits(nextHourly, 'tempC', 'tempF');

                        const slotTime = new Date(now);
                        if (slotHour != null) {
                            slotTime.setHours(slotHour, 0, 0, 0);
                            if (slotTime <= now) slotTime.setHours(slotHour + 24, 0, 0, 0);
                        }

                        items.push({
                            title: `${city} ${slotLabel}: ${slotDesc}, near ${slotTemp}°${symbol}.`,
                            url: `https://wttr.in/${encoded}`,
                            publishedAt: slotTime,
                        });
                    }

                    // Include compact outlook items for tomorrow and the next day when available.
                    const futureDays = days.slice(1, 3);
                    futureDays.forEach((futureDay, idx) => {
                        const dayLabel = idx === 0 ? 'Tomorrow' : 'Following day';
                        const outlookDesc = futureDay?.hourly?.[4]?.weatherDesc?.[0]?.value
                            || futureDay?.hourly?.[0]?.weatherDesc?.[0]?.value
                            || 'conditions unknown';
                        const max = getTempForUnits(futureDay, 'maxtempC', 'maxtempF');
                        const min = getTempForUnits(futureDay, 'mintempC', 'mintempF');

                        const publishedAt = futureDay?.date
                            ? new Date(`${futureDay.date}T09:00:00`)
                            : new Date(now.getTime() + (idx + 1) * 24 * 60 * 60 * 1000);

                        items.push({
                            title: `${dayLabel} in ${city}: ${outlookDesc}. High ${max}°${symbol}, low ${min}°${symbol}.`,
                            url: `https://wttr.in/${encoded}`,
                            publishedAt,
                        });
                    });

        return items;
    } catch {
        return [];
    }
}

/**
 * Fetch RSS items from all sources in a topic.
 * @param {import('../models/topic.model')} topic
 * @param {{ city?: string, latitude?: number, longitude?: number }|null} [userLocation]
 * @param {{ weatherUnits?: 'metric'|'imperial' }} [options]
 * @returns {Promise<Array>}
 */
async function fetchTopicItems(topic, userLocation, options = {}) {
    const resolvedSources = interpolateSources(topic.sources, userLocation ?? null);
    const weatherUnits = normalizeWeatherUnits(options.weatherUnits);

    const results = await Promise.allSettled(
        resolvedSources.map((url) =>
            new URL(url).hostname === 'wttr.in'
                ? fetchWttrIn(userLocation.city, weatherUnits)
                : fetchRssUrl(url)
        )
    );

    const allItems = results
        .filter((r) => r.status === 'fulfilled')
        .flatMap((r) => r.value);

    return allItems
        .filter((item) => item.title && item.url)
        .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
        .slice(0, 5);
}

/**
 * Select the next user topic to serve, preferring those not served recently.
 * @param {import('../models/user.model')} user
 * @returns {object|null}
 */
function selectNextUserTopic(user) {
    const eligible = (user.topics || []).filter(
        (t) =>
            t.enabled &&
            t.topicId &&
            !(t.topicId.requiresLocation && !user.location?.city)
    );

    if (eligible.length === 0) return null;

    eligible.sort((a, b) => {
        const aTime = a.lastServedAt ? new Date(a.lastServedAt).getTime() : 0;
        const bTime = b.lastServedAt ? new Date(b.lastServedAt).getTime() : 0;
        if (aTime !== bTime) return aTime - bTime; // oldest served first
        return (b.priority || 1) - (a.priority || 1); // higher priority second
    });

    return eligible[0];
}

/**
 * Interpolate a song-reference phrase with {song} and {artist} values.
 * @param {string} template
 * @param {{ name?: string, artist?: string }} track
 * @returns {string}
 */
function interpolateTrack(template, track) {
    return template
        .replace('{song}', track.name || 'that last track')
        .replace('{artist}', track.artist || 'the artist');
}

/**
 * Truncate text to the nearest sentence boundary if it exceeds `limit` characters.
 * Prefers the last period at-or-before `limit`; if none exists, extends to the
 * first period after `limit`. Returns the original string when it is within the
 * limit or contains no period.
 * @param {string} text
 * @param {number} [limit=100]
 * @returns {string}
 */
function truncateToSentence(text, limit = 150) {
    if (text.length <= limit) return text;
    const lastPeriodBefore = text.lastIndexOf('.', limit - 1);
    if (lastPeriodBefore !== -1) return text.slice(0, lastPeriodBefore + 1).trim();
    const firstPeriodAfter = text.indexOf('.', limit);
    if (firstPeriodAfter !== -1) return text.slice(0, firstPeriodAfter + 1).trim();
    return text;
}

/**
 * Truncate text to at most `maxSentences` sentences.
 * @param {string} text
 * @param {number} [maxSentences=2]
 * @returns {string}
 */
function truncateToSentences(text, maxSentences = 2) {
    if (!text) return '';
    // Split on sentence-ending punctuation followed by whitespace or end-of-string
    const sentenceRegex = /[^.!?]*[.!?]+(\s|$)/g;
    const sentences = text.match(sentenceRegex);
    if (!sentences) return text.trim();
    return sentences.slice(0, maxSentences).join('').trim();
}

const VALID_PERSONALITIES = ['calm', 'smooth', 'deep', 'energetic', 'cool', 'witty', 'serious', 'playful', 'sardonic'];

/**
 * Resolve the personality string, falling back to 'smooth' for unknown values.
 * @param {string|undefined} personality
 * @returns {string}
 */
function resolvePersonality(personality) {
    return VALID_PERSONALITIES.includes(personality) ? personality : 'smooth';
}

/**
 * Look up a personality-scoped phrase set for the given tone.
 * Falls back: tone → 'casual', personality → 'smooth'.
 * @param {string} tone
 * @param {string} personality
 * @returns {object}
 */
function getTemplates(tone, personality) {
    const toneBlock = TONE_TEMPLATES[tone] || TONE_TEMPLATES.casual;
    return toneBlock[personality] || toneBlock.smooth || Object.values(toneBlock)[0];
}

/**
 * Attach optional song reference phrases to both ends of a blurb string.
 * Each reference has a 50% probability of being included.
 * @param {string} blurb
 * @param {object} topic
 * @param {string|undefined} preferredTone
 * @param {string} personality
 * @param {{ previousTrack?: object, nextTrack?: object }} trackContext
 * @returns {string}
 */
function attachSongRefs(blurb, topic, preferredTone, personality, { previousTrack, nextTrack } = {}) {
    if (previousTrack && Math.random() < 0.5) {
        const refTemplates = getTemplates(pickTone(topic, preferredTone), personality);
        blurb = `${interpolateTrack(pickRandom(refTemplates.songPrevRef), previousTrack)} ${blurb}`;
    }
    if (nextTrack && Math.random() < 0.5) {
        const refTemplates = getTemplates(pickTone(topic, preferredTone), personality);
        blurb = `${blurb} ${interpolateTrack(pickRandom(refTemplates.songNextRef), nextTrack)}`;
    }
    return blurb;
}

// ─── Format Generators ───────────────────────────────────────────────────────

/**
 * Format: three_article (original)
 * opener + up to 3 headlines, each randomly title or summary + closer.
 */
function generateThreeArticleBlurb(topic, items, preferredTone, personality, { previousTrack, nextTrack } = {}) {
    if (!items || items.length === 0) return null;

    // Randomly pick title-only vs summary (or title fallback) per headline
    const headlines = items.slice(0, 3).map((i) =>
        Math.random() < 0.5
            ? truncateToSentence(i.title)
            : truncateToSentence(i.summary || i.title)
    );

    // ── Opener ──────────────────────────────────────────────────────────────
    const openerTemplates = getTemplates(pickTone(topic, preferredTone), personality);
    const openerPhrase = pickRandom(openerTemplates.openers).replace('{name}', topic.name);
    const parts = [`${openerPhrase}: ${headlines[0]}.`];

    // ── Middle headlines ────────────────────────────────────────────────────
    if (headlines[1]) {
        const connTemplates = getTemplates(pickTone(topic, preferredTone), personality);
        parts.push(`${pickRandom(connTemplates.connectors)}, ${headlines[1]}.`);
    }
    if (headlines[2]) {
        const connTemplates = getTemplates(pickTone(topic, preferredTone), personality);
        parts.push(`${pickRandom(connTemplates.connectors)}, ${headlines[2]}.`);
    }

    // ── Closer ──────────────────────────────────────────────────────────────
    const closerTemplates = getTemplates(pickTone(topic, preferredTone), personality);
    const closerPhrase = pickRandom(closerTemplates.closers).replace('{name}', topic.name);
    parts.push(closerPhrase);

    return attachSongRefs(parts.join(' '), topic, preferredTone, personality, { previousTrack, nextTrack });
}

/**
 * Format: single_article
 * Deep focus on one article — uses both its title and summary.
 */
function generateSingleArticleBlurb(topic, items, preferredTone, personality, { previousTrack, nextTrack } = {}) {
    if (!items || items.length === 0) return null;

    const item = items[0];
    const title = truncateToSentence(item.title);
    const summary = item.summary ? truncateToSentences(item.summary, 4) : null;

    const openerTemplates = getTemplates(pickTone(topic, preferredTone), personality);
    const openerPhrase = pickRandom(openerTemplates.openers).replace('{name}', topic.name);

    const closerTemplates = getTemplates(pickTone(topic, preferredTone), personality);
    const closerPhrase = pickRandom(closerTemplates.closers).replace('{name}', topic.name);

    const parts = [`${openerPhrase}: ${title}.`];
    if (summary) parts.push(summary);
    parts.push(closerPhrase);

    return attachSongRefs(parts.join(' '), topic, preferredTone, personality, { previousTrack, nextTrack });
}

/**
 * Format: quickfire
 * Rapid-fire listing of up to 3 article titles, no summaries.
 */
function generateQuickfireBlurb(topic, items, preferredTone, personality, { previousTrack, nextTrack } = {}) {
    if (!items || items.length === 0) return null;

    const titles = items.slice(0, 3).map((i) => truncateToSentence(i.title));

    const openerTemplates = getTemplates(pickTone(topic, preferredTone), personality);
    const openerPhrase = pickRandom(openerTemplates.openers).replace('{name}', topic.name);

    const closerTemplates = getTemplates(pickTone(topic, preferredTone), personality);
    const closerPhrase = pickRandom(closerTemplates.closers).replace('{name}', topic.name);

    let titleList;
    if (titles.length === 1) {
        titleList = `"${titles[0]}"`;
    } else if (titles.length === 2) {
        titleList = `"${titles[0]}" and "${titles[1]}"`;
    } else {
        titleList = `"${titles[0]}", "${titles[1]}", and "${titles[2]}"`;
    }

    const blurb = `${openerPhrase}: ${titleList}. ${closerPhrase}`;
    return attachSongRefs(blurb, topic, preferredTone, personality, { previousTrack, nextTrack });
}

/**
 * Format: music_only
 * No topic content — purely references the previous and/or upcoming track.
 * Returns null if neither track is available.
 */
function generateMusicOnlyBlurb({ previousTrack, nextTrack } = {}, personality = 'smooth') {
    if (!previousTrack && !nextTrack) return null;

    const tone = pickTone({ tones: ['casual', 'happy', 'optimistic'] }, undefined);
    const templates = getTemplates(tone, personality);

    const parts = [];
    if (previousTrack) {
        parts.push(interpolateTrack(pickRandom(templates.songPrevRef), previousTrack));
    }
    if (nextTrack) {
        parts.push(interpolateTrack(pickRandom(templates.songNextRef), nextTrack));
    }

    return parts.join(' ');
}

/**
 * Randomly select a blurb format from the available pool.
 * music_only is only eligible when at least one track context is provided.
 * @param {{ previousTrack?: object, nextTrack?: object }} trackContext
 * @returns {'three_article'|'single_article'|'quickfire'|'music_only'}
 */
function pickBlurbFormat({ previousTrack, nextTrack } = {}) {
    const formats = ['three_article', 'single_article', 'quickfire'];
    if (previousTrack || nextTrack) formats.push('music_only');
    return formats[Math.floor(Math.random() * formats.length)];
}

/**
 * Dispatcher: generate a blurb using the specified format.
 * Falls back to three_article for unrecognised format values.
 * @param {object} topic
 * @param {Array} items
 * @param {string|undefined} preferredTone
 * @param {{ previousTrack?: object, nextTrack?: object }} trackContext
 * @param {'three_article'|'single_article'|'quickfire'|'music_only'} format
 * @returns {string|null}
 */
function generateTemplateBlurb(topic, items, preferredTone, personality, trackContext = {}, format = 'three_article') {
    switch (format) {
        case 'single_article': return generateSingleArticleBlurb(topic, items, preferredTone, personality, trackContext);
        case 'quickfire':      return generateQuickfireBlurb(topic, items, preferredTone, personality, trackContext);
        case 'music_only':     return generateMusicOnlyBlurb(trackContext, personality);
        default:               return generateThreeArticleBlurb(topic, items, preferredTone, personality, trackContext);
    }
}

/**
 * Generate a radio blurb for the given user.
 * @param {import('mongoose').Types.ObjectId|string} userId
 * @param {{ previousTrack?: { name?: string, artist?: string }, nextTrack?: { name?: string, artist?: string }, weatherUnits?: 'metric'|'imperial' }} [trackContext]
 * @returns {Promise<{ topicId: string|null, topic: string|null, text: string, sourceCount: number }>}
 */
async function getRadioHostBlurbForUser(userId, trackContext = {}) {
    const user = await User.findById(userId).populate('topics.topicId');

    if (!user) {
        return { topicId: null, topic: null, text: FALLBACK_TEXT, sourceCount: 0, articles: [] };
    }

    // Pick format first — music_only skips topic selection and article fetching entirely
    let format = pickBlurbFormat(trackContext);

    const personality = resolvePersonality(trackContext.hostPersonality);

    if (format === 'music_only') {
        const text = generateMusicOnlyBlurb(trackContext, personality);
        if (text) {
            return { topicId: null, topic: null, text, sourceCount: 0, articles: [] };
        }
        // music_only returned null (no tracks) — fall through with a topic-based format
        format = pickRandom(['three_article', 'single_article', 'quickfire']);
    }

    const selectedEntry = selectNextUserTopic(user);

    if (!selectedEntry) {
        return { topicId: null, topic: null, text: FALLBACK_TEXT, sourceCount: 0, articles: [] };
    }

    const topic = selectedEntry.topicId;

    // For weather topics, use single_article format to provide depth on conditions
    if (topic.slug === 'weather') {
        format = 'single_article';
    }

    const items = await fetchTopicItems(topic, user.location ?? null, {
        weatherUnits: normalizeWeatherUnits(trackContext.weatherUnits),
    });

    // Article slice size depends on format: single_article needs 1, others up to 3
    const articleCount = format === 'single_article' ? 1 : 3;
    const articleSlice = items.slice(0, articleCount).map((i) => ({ title: i.title, url: i.url, sourceUrl: i.sourceUrl || '' }));

    if (items.length === 0) {
        return {
            topicId: topic._id.toString(),
            topic: topic.name,
            text: FALLBACK_TEXT,
            sourceCount: 0,
            articles: [],
        };
    }

    const text = generateTemplateBlurb(
        topic,
        items.slice(0, 5),
        selectedEntry.preferredTone || undefined,
        personality,
        trackContext,
        format,
    );

    if (!text) {
        return {
            topicId: topic._id.toString(),
            topic: topic.name,
            text: FALLBACK_TEXT,
            sourceCount: 0,
            articles: articleSlice,
        };
    }

    selectedEntry.lastServedAt = new Date();
    await user.save();

    return {
        topicId: topic._id.toString(),
        topic: topic.name,
        text,
        sourceCount: items.length,
        articles: articleSlice,
        format,
    };
}

module.exports = {
    fetchTopicItems,
    selectNextUserTopic,
    pickBlurbFormat,
    generateThreeArticleBlurb,
    generateSingleArticleBlurb,
    generateQuickfireBlurb,
    generateMusicOnlyBlurb,
    generateTemplateBlurb,
    getRadioHostBlurbForUser,
};
