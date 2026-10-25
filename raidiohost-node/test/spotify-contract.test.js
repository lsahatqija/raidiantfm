const { createSpotifyContract } = require('../src/services/spotify-contract.service');

function response(status, body, headers = {}) {
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: { entries: () => Object.entries(headers), get: (name) => headers[name.toLowerCase()] ?? null },
        json: async () => body,
    };
}

describe('Spotify quota-mode contract', () => {
    it('caps Development Mode searches at 10 while preserving Extended Mode limits', () => {
        expect(createSpotifyContract({ quotaMode: 'development' }).clampSearchLimit(50)).toBe(10);
        expect(createSpotifyContract({ quotaMode: 'extended' }).clampSearchLimit(50)).toBe(50);
        expect(createSpotifyContract({ quotaMode: 'development' }).clampSearchLimit(0)).toBe(1);
    });

    it('maps playlist summary fields according to the configured quota contract', () => {
        const development = createSpotifyContract({ quotaMode: 'development' });
        const extended = createSpotifyContract({ quotaMode: 'extended' });

        expect(development.playlistTotalFields).toBe('items(total)');
        expect(development.getPlaylistItemTotal({ items: { total: 4 } })).toBe(4);
        expect(extended.playlistTotalFields).toBe('tracks(total)');
        expect(extended.getPlaylistItemTotal({ tracks: { total: 7 } })).toBe(7);
    });

    it('uses the current playlist items endpoint and response contract', async () => {
        const fetch = vi.fn().mockResolvedValue(response(200, {
            items: [{ item: { id: 'track-1', uri: 'spotify:track:track-1' } }],
            total: 1,
        }));
        const contract = createSpotifyContract({ quotaMode: 'development', fetch });

        const result = await contract.getPlaylistItems(
            { getAccessToken: () => 'test-access-token' },
            'playlist/one',
            { limit: 50, offset: 2 },
        );

        expect(fetch).toHaveBeenCalledWith(
            'https://api.spotify.com/v1/playlists/playlist%2Fone/items?limit=50&offset=2',
            { headers: { Authorization: 'Bearer test-access-token' } },
        );
        expect(result.body.items[0].item.id).toBe('track-1');
    });

    it('honors Retry-After with a bounded retry for Spotify 429 responses', async () => {
        const fetch = vi.fn()
            .mockResolvedValueOnce(response(429, {
                error: { status: 429, message: 'Too many requests', reason: 'QUOTA_EXCEEDED' },
            }, { 'retry-after': '2' }))
            .mockResolvedValueOnce(response(200, { items: [], total: 0 }));
        const wait = vi.fn().mockResolvedValue(undefined);
        const contract = createSpotifyContract({ quotaMode: 'development', fetch, wait, random: () => 0 });

        await expect(contract.getPlaylistItems(
            { getAccessToken: () => 'test-access-token' },
            'playlist-1',
        )).resolves.toEqual(expect.objectContaining({ body: { items: [], total: 0 } }));

        expect(wait).toHaveBeenCalledWith(2000);
        expect(fetch).toHaveBeenCalledTimes(2);
    });
});
