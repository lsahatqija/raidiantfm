const { createRssService } = require('../src/services/rss.service');

describe('RSS service', () => {
    it('parses XML only through the bounded safe HTTP gateway', async () => {
        const httpClient = {
            get: vi.fn().mockResolvedValue(Buffer.from(`
                <rss version="2.0"><channel><title>Feed</title><item>
                <title>Headline</title><link>https://news.example/item</link>
                <description>Summary</description>
                </item></channel></rss>
            `)),
        };
        const service = createRssService({ httpClient, concurrency: 2 });

        const items = await service.fetchRssUrl('https://feed.example/rss');

        expect(httpClient.get).toHaveBeenCalledWith('https://feed.example/rss', expect.objectContaining({
            allowedContentTypes: expect.arrayContaining(['application/rss+xml']),
            maxBytes: expect.any(Number),
        }));
        expect(items[0]).toMatchObject({ title: 'Headline', url: 'https://news.example/item' });
    });

    it('caps concurrent feed downloads', async () => {
        let active = 0;
        let peak = 0;
        const releases = [];
        const httpClient = {
            get: vi.fn(async () => {
                active += 1;
                peak = Math.max(peak, active);
                await new Promise((resolve) => releases.push(resolve));
                active -= 1;
                return Buffer.from('<rss version="2.0"><channel><title>Feed</title></channel></rss>');
            }),
        };
        const service = createRssService({ httpClient, concurrency: 2 });
        const requests = [1, 2, 3].map((id) => service.fetchRssUrl(`https://feed${id}.example/rss`));

        await vi.waitFor(() => expect(httpClient.get).toHaveBeenCalledTimes(2));
        releases.shift()();
        await vi.waitFor(() => expect(httpClient.get).toHaveBeenCalledTimes(3));
        while (releases.length) releases.shift()();
        await Promise.all(requests);

        expect(peak).toBe(2);
    });
});
