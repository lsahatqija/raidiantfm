const {
    OutboundRequestError,
    createSafeHttpClient,
    isPublicAddress,
} = require('../src/services/outbound-http.service');

describe('safe outbound HTTP', () => {
    it.each([
        '127.0.0.1',
        '10.0.0.1',
        '172.16.0.1',
        '192.168.1.1',
        '169.254.169.254',
        '0.0.0.0',
        '::1',
        'fc00::1',
        'fe80::1',
        '::ffff:127.0.0.1',
        '2001:db8::1',
        '2001::1',
        '2002:7f00:1::',
    ])('rejects private or reserved address %s', (address) => {
        expect(isPublicAddress(address)).toBe(false);
    });

    it.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111'])(
        'accepts globally routable address %s',
        (address) => expect(isPublicAddress(address)).toBe(true),
    );

    it('rejects a hostname when any DNS result is non-public', async () => {
        const client = createSafeHttpClient({
            lookup: vi.fn().mockResolvedValue([
                { address: '203.0.113.10', family: 4 },
                { address: '127.0.0.1', family: 4 },
            ]),
            requestOnce: vi.fn(),
        });

        await expect(client.get('https://feed.example/rss')).rejects.toMatchObject({
            code: 'unsafe_destination',
        });
    });

    it('revalidates and pins every redirect destination', async () => {
        const lookup = vi.fn()
            .mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }])
            .mockResolvedValueOnce([{ address: '169.254.169.254', family: 4 }]);
        const requestOnce = vi.fn().mockResolvedValueOnce({
            statusCode: 302,
            headers: { location: 'http://metadata.example/latest' },
            body: Buffer.alloc(0),
        });
        const client = createSafeHttpClient({ lookup, requestOnce });

        await expect(client.get('https://feed.example/rss')).rejects.toMatchObject({
            code: 'unsafe_destination',
        });
        expect(requestOnce).toHaveBeenCalledWith(
            expect.any(URL),
            expect.objectContaining({ address: '93.184.216.34' }),
            expect.any(Object),
        );
        expect(requestOnce.mock.calls[0][0].hostname).toBe('feed.example');
        expect(requestOnce).toHaveBeenCalledTimes(1);
    });

    it('detects DNS changes before a later request can use the rebound address', async () => {
        const lookup = vi.fn()
            .mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }])
            .mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }]);
        const requestOnce = vi.fn().mockResolvedValue({
            statusCode: 200,
            headers: { 'content-type': 'application/rss+xml' },
            body: Buffer.from('<rss />'),
        });
        const client = createSafeHttpClient({ lookup, requestOnce });

        await expect(client.get('https://feed.example/rss')).resolves.toBeInstanceOf(Buffer);
        await expect(client.get('https://feed.example/rss')).rejects.toMatchObject({ code: 'unsafe_destination' });
        expect(requestOnce).toHaveBeenCalledTimes(1);
    });

    it('rejects unsupported content, oversized bodies, and timeouts with stable codes', async () => {
        for (const code of ['unsupported_content_type', 'response_too_large', 'outbound_timeout']) {
            const client = createSafeHttpClient({
                lookup: vi.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]),
                requestOnce: vi.fn().mockRejectedValue(new OutboundRequestError(code, code)),
            });
            await expect(client.get('https://feed.example/rss')).rejects.toMatchObject({ code });
        }
    });
});
