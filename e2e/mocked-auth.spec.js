const { test, expect } = require('@playwright/test');

test('restores a mocked Spotify user without external credentials', async ({ page }) => {
    await page.addInitScript(() => {
        window.sessionStorage.setItem('raidiohost-auth', JSON.stringify({
            accessToken: 'fixture-access-token',
            refreshToken: 'fixture-refresh-token',
            expiresAt: Date.now() + 60 * 60 * 1000,
        }));
    });

    await page.route('https://api.spotify.com/v1/me', (route) => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
            id: 'spotify-user-a',
            display_name: 'Spotify Fixture',
            images: [],
        }),
    }));

    await page.route('https://sdk.scdn.co/spotify-player.js', (route) => route.fulfill({
        contentType: 'application/javascript',
        body: 'window.Spotify = { Player: class { addListener() {} connect() {} disconnect() {} } };',
    }));

    await page.route('**/api/**', async (route) => {
        const path = new URL(route.request().url()).pathname;
        const payloads = {
            '/api/users/me': {
                spotifyId: 'spotify-user-a',
                username: 'Test Listener',
                spotifyDisplayName: 'Spotify Fixture',
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

    await page.goto('/');

    await expect(page.getByText('Test Listener')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Login with Spotify' })).toHaveCount(0);
});
