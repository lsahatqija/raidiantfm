const { test, expect } = require('@playwright/test');

test.use({ baseURL: process.env.PLAYWRIGHT_PWA_BASE_URL });

test('installs the production worker and cold-launches without private cache entries', async ({ page, context }) => {
    await page.goto('/');

    const manifestResponse = await page.request.get('/manifest.webmanifest');
    expect(manifestResponse.ok()).toBe(true);
    await expect(manifestResponse.json()).resolves.toMatchObject({
        name: 'RaidiantFM',
        display: 'standalone',
    });

    await page.evaluate(async () => {
        await navigator.serviceWorker.ready;
    });
    if (!await page.evaluate(() => Boolean(navigator.serviceWorker.controller))) {
        await page.reload();
    }
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await expect.poll(() => page.evaluate(async () => {
        const names = await caches.keys();
        return names.includes('raidiantfm-shell-v1');
    })).toBe(true);

    const cachedUrls = await page.evaluate(async () => {
        const names = await caches.keys();
        const urls = [];
        for (const name of names) {
            if (!name.startsWith('raidiantfm-')) continue;
            const cache = await caches.open(name);
            urls.push(...(await cache.keys()).map((request) => request.url));
        }
        return urls;
    });
    expect(cachedUrls.some((url) => /\/assets\/.*\.js$/.test(url))).toBe(true);
    expect(cachedUrls.some((url) => /\/assets\/.*\.css$/.test(url))).toBe(true);
    expect(cachedUrls.filter((url) => /\/(auth|api)(\/|$)/.test(new URL(url).pathname))).toEqual([]);

    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'RaidiantFM' })).toBeVisible();
    await expect(page.getByText(/playback and fresh content need a connection/i)).toBeVisible();
    await context.setOffline(false);
});
