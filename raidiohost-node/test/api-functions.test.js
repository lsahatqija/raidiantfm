const { mapTrack } = require('../src/controllers/api.functions');

describe('mapTrack', () => {
    it('maps Spotify track data into the public API shape', () => {
        const track = mapTrack({
            id: 'track-1',
            uri: 'spotify:track:track-1',
            name: 'Test Track',
            artists: [{ name: 'Artist One' }, { name: 'Artist Two' }],
            album: { name: 'Test Album', images: [{ url: 'https://images.example/cover.jpg' }] },
        });

        expect(track).toEqual({
            id: 'track-1',
            uri: 'spotify:track:track-1',
            name: 'Test Track',
            artists: 'Artist One, Artist Two',
            album: 'Test Album',
            image: 'https://images.example/cover.jpg',
        });
    });
});
