const Parser = require('rss-parser');
const { createSafeHttpClient } = require('./outbound-http.service');

const parser = new Parser();
const RSS_CONTENT_TYPES = [
    'application/atom+xml',
    'application/rss+xml',
    'application/xml',
    'text/xml',
];

function createSemaphore(limit) {
    let active = 0;
    const queue = [];
    return async function withPermit(operation) {
        if (active >= limit) await new Promise((resolve) => queue.push(resolve));
        active += 1;
        try {
            return await operation();
        } finally {
            active -= 1;
            queue.shift()?.();
        }
    };
}

function createRssService({ httpClient = createSafeHttpClient(), concurrency = 4 } = {}) {
    const withPermit = createSemaphore(concurrency);

    async function fetchRssUrl(url) {
        try {
            const body = await withPermit(() => httpClient.get(url, {
                allowedProtocols: ['http:', 'https:'],
                allowedContentTypes: RSS_CONTENT_TYPES,
                connectTimeoutMs: 3_000,
                readTimeoutMs: 7_000,
                maxBytes: 1_000_000,
                maxRedirects: 3,
            }));
            const feed = await parser.parseString(body.toString('utf8'));
            return (feed.items || []).map((item) => ({
                title: item.title || '',
                summary: item.contentSnippet || item.content || item.summary || '',
                url: item.link || '',
                publishedAt: item.isoDate ? new Date(item.isoDate) : new Date(),
                sourceUrl: url,
            }));
        } catch (error) {
            const safeError = new Error('RSS feed could not be fetched or parsed');
            safeError.code = error.code || 'invalid_feed';
            throw safeError;
        }
    }

    return { fetchRssUrl };
}

const defaultService = createRssService();

/**
 * Fetch and normalize items from an RSS/Atom feed URL.
 * @param {string} url
 * @returns {Promise<Array<{ title: string, summary: string, url: string, publishedAt: Date, sourceUrl: string }>>}
 */
async function fetchRssUrl(url) {
    return defaultService.fetchRssUrl(url);
}

module.exports = { createRssService, fetchRssUrl };
