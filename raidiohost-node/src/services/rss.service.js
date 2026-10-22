const Parser = require('rss-parser');

const parser = new Parser();

/**
 * Fetch and normalize items from an RSS/Atom feed URL.
 * @param {string} url
 * @returns {Promise<Array<{ title: string, summary: string, url: string, publishedAt: Date, sourceUrl: string }>>}
 */
async function fetchRssUrl(url) {
    let feed;
    try {
        feed = await parser.parseURL(url);
    } catch (err) {
        throw new Error(`Failed to parse RSS feed at ${url}: ${err.message}`);
    }

    return (feed.items || []).map((item) => ({
        title: item.title || '',
        summary: item.contentSnippet || item.content || item.summary || '',
        url: item.link || '',
        publishedAt: item.isoDate ? new Date(item.isoDate) : new Date(),
        sourceUrl: url,
    }));
}

module.exports = { fetchRssUrl };
