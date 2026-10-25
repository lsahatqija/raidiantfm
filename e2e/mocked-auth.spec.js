const { test, expect } = require('@playwright/test');

test('restores cookie sessions and isolates browser state across account switches', async ({ page }) => {
    let activeUser = {
        id: 'user-a',
        spotifyId: 'spotify-user-a',
        username: 'Test Listener A',
    };

    await page.addInitScript(() => {
        window.localStorage.setItem('raidiohost:user:user-a:queued-track', JSON.stringify({
            id: 'queued-a', uri: 'spotify:track:queued-a', name: 'Queued A', artists: 'Artist A',
        }));
        window.localStorage.setItem('raidiohost:user:user-b:queued-track', JSON.stringify({
            id: 'queued-b', uri: 'spotify:track:queued-b', name: 'Queued B', artists: 'Artist B',
        }));
        window.localStorage.setItem('raidiohost:user:user-a:voice-name', JSON.stringify('Voice A'));
        window.localStorage.setItem('raidiohost:user:user-b:voice-name', JSON.stringify('Voice B'));
    });

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
        body: JSON.stringify({ user: activeUser }),
    }));

    await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
        const path = new URL(route.request().url()).pathname;
        const payloads = {
            '/api/users/me': {
                spotifyId: activeUser.spotifyId,
                username: activeUser.username,
                spotifyDisplayName: activeUser.username,
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

    await expect(page.getByText('Test Listener A')).toBeVisible();
    await expect(page.getByText(/Queued A/)).toBeVisible();
    await expect(page.getByText('Voice A')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Login with Spotify' })).toHaveCount(0);

    activeUser = {
        id: 'user-b',
        spotifyId: 'spotify-user-b',
        username: 'Test Listener B',
    };
    await page.reload();

    await expect(page.getByText('Test Listener B')).toBeVisible();
    await expect(page.getByText(/Queued B/)).toBeVisible();
    await expect(page.getByText('Voice B')).toBeVisible();
    await expect(page.getByText(/Queued A/)).toHaveCount(0);
    await expect(page.getByText('Voice A')).toHaveCount(0);
});
