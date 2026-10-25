const { test, expect } = require('@playwright/test');
const axeSource = require('axe-core').source;

async function mockAuthenticatedApp(page) {
    await page.route('https://sdk.scdn.co/spotify-player.js', (route) => route.fulfill({
        contentType: 'application/javascript',
        body: `
            window.Spotify = { Player: class {
                constructor() { this.listeners = new Map(); }
                addListener(name, callback) { this.listeners.set(name, callback); }
                connect() { this.listeners.get('ready')?.({ device_id: 'fixture-device' }); }
                disconnect() {}
                setVolume() { return Promise.resolve(); }
            } };
            window.onSpotifyWebPlaybackSDKReady?.();
        `,
    }));
    await page.route('**/auth/session', (route) => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
            user: { id: 'pwa-user', spotifyId: 'spotify-pwa-user', username: 'Mobile Listener' },
        }),
    }));
    await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
        const path = new URL(route.request().url()).pathname;
        const payloads = {
            '/api/users/me': {
                spotifyId: 'spotify-pwa-user',
                username: 'Mobile Listener',
                spotifyDisplayName: 'Mobile Listener',
                location: { city: '', latitude: null, longitude: null },
                lastVolume: 0.5,
            },
            '/api/playlists': { playlists: [], total: 0 },
            '/api/suggestions': { tracks: [] },
            '/api/radio/topics': { topics: [] },
            '/api/radio/my-topics': { topics: [] },
        };
        await route.fulfill({
            status: payloads[path] ? 200 : 404,
            contentType: 'application/json',
            body: JSON.stringify(payloads[path] ?? { error: 'unmocked route' }),
        });
    });
}

test('keeps core controls usable across Phase 4 breakpoints', async ({ page }, testInfo) => {
    await mockAuthenticatedApp(page);
    await page.goto('/');
    await expect(page.getByText('Mobile Listener')).toBeVisible();

    for (const width of [320, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();
        const overflow = await page.evaluate(() => ({
            clientWidth: document.documentElement.clientWidth,
            scrollWidth: document.documentElement.scrollWidth,
        }));
        expect(overflow.scrollWidth, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(overflow.clientWidth);
        await page.screenshot({ path: testInfo.outputPath(`responsive-${width}.png`), fullPage: true });
    }
});

test('meets the automated accessibility and mobile touch-target gates', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await mockAuthenticatedApp(page);
    await page.goto('/');
    await expect(page.getByText('Mobile Listener')).toBeVisible();

    await page.addScriptTag({ content: axeSource });
    const results = await page.evaluate(() => window.axe.run());
    const blockingViolations = results.violations.filter(({ impact }) =>
        impact === 'critical' || impact === 'serious');
    expect(blockingViolations).toEqual([]);

    const undersizedControls = await page.locator('button, input, summary').evaluateAll((elements) =>
        elements.flatMap((element) => {
            const rect = element.getBoundingClientRect();
            const visible = rect.width > 0 && rect.height > 0;
            if (!visible || (rect.width >= 44 && rect.height >= 44)) return [];
            return [{
                label: element.getAttribute('aria-label') || element.textContent.trim() || element.tagName,
                width: Math.round(rect.width),
                height: Math.round(rect.height),
            }];
        }));
    expect(undersizedControls).toEqual([]);

    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).not.toHaveJSProperty('tagName', 'BODY');
});
