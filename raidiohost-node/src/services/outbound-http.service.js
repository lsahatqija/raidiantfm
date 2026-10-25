const dns = require('node:dns').promises;
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');

const blockedAddresses = new net.BlockList();
for (const [network, prefix] of [
    ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
    ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
    ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
    ['224.0.0.0', 4], ['240.0.0.0', 4],
]) blockedAddresses.addSubnet(network, prefix, 'ipv4');
for (const [network, prefix] of [
    ['::', 128], ['::1', 128], ['64:ff9b::', 96], ['100::', 64],
    ['2001::', 32], ['2001:2::', 48], ['2001:10::', 28], ['2001:20::', 28],
    ['2001:db8::', 32], ['2002::', 16], ['fc00::', 7],
    ['fe80::', 10], ['ff00::', 8],
]) blockedAddresses.addSubnet(network, prefix, 'ipv6');

class OutboundRequestError extends Error {
    constructor(code, message) {
        super(message);
        this.name = 'OutboundRequestError';
        this.code = code;
    }
}

function normalizeAddress(address) {
    return address.startsWith('[') && address.endsWith(']') ? address.slice(1, -1) : address;
}

function isPublicAddress(rawAddress) {
    const address = normalizeAddress(rawAddress);
    const mappedIpv4 = address.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
    if (mappedIpv4) return isPublicAddress(mappedIpv4[1]);
    const family = net.isIP(address);
    if (!family) return false;
    return !blockedAddresses.check(address, family === 6 ? 'ipv6' : 'ipv4');
}

async function defaultRequestOnce(url, target, options) {
    const transport = url.protocol === 'https:' ? https : http;
    return new Promise((resolve, reject) => {
        let connectTimer;
        let totalTimer;
        const request = transport.request(url, {
            method: 'GET',
            headers: options.headers,
            servername: normalizeAddress(url.hostname),
            lookup(_hostname, _lookupOptions, callback) {
                callback(null, target.address, target.family);
            },
        }, (response) => {
            clearTimeout(connectTimer);
            const chunks = [];
            let receivedBytes = 0;

            response.on('data', (chunk) => {
                receivedBytes += chunk.length;
                if (receivedBytes > options.maxBytes) {
                    response.destroy(new OutboundRequestError('response_too_large', 'Outbound response exceeded the byte limit'));
                    return;
                }
                chunks.push(chunk);
            });
            response.on('end', () => resolve({
                statusCode: response.statusCode || 0,
                headers: response.headers,
                body: Buffer.concat(chunks),
            }));
            response.on('error', reject);
            response.socket?.setTimeout(options.readTimeoutMs, () => {
                response.destroy(new OutboundRequestError('outbound_timeout', 'Outbound response timed out'));
            });
        });

        request.on('socket', (socket) => {
            connectTimer = setTimeout(() => {
                request.destroy(new OutboundRequestError('outbound_timeout', 'Outbound connection timed out'));
            }, options.connectTimeoutMs);
            socket.once(url.protocol === 'https:' ? 'secureConnect' : 'connect', () => clearTimeout(connectTimer));
        });
        request.on('error', reject);
        totalTimer = setTimeout(() => {
            request.destroy(new OutboundRequestError('outbound_timeout', 'Outbound request timed out'));
        }, options.connectTimeoutMs + options.readTimeoutMs);
        request.on('close', () => {
            clearTimeout(connectTimer);
            clearTimeout(totalTimer);
        });
        request.end();
    });
}

function createSafeHttpClient({ lookup = dns.lookup, requestOnce = defaultRequestOnce } = {}) {
    async function resolveTarget(url) {
        const hostname = normalizeAddress(url.hostname);
        const literalFamily = net.isIP(hostname);
        const addresses = literalFamily
            ? [{ address: hostname, family: literalFamily }]
            : await lookup(hostname, { all: true, verbatim: true });

        if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
            throw new OutboundRequestError('unsafe_destination', 'Outbound destination is private or reserved');
        }
        return addresses[0];
    }

    async function get(rawUrl, requestOptions = {}) {
        const options = {
            allowedProtocols: ['https:'],
            allowedContentTypes: [],
            allowedHosts: null,
            connectTimeoutMs: 3_000,
            readTimeoutMs: 7_000,
            maxBytes: 1_000_000,
            maxRedirects: 3,
            headers: { 'User-Agent': 'RaidiantFM/1.0' },
            ...requestOptions,
        };

        let currentUrl;
        try {
            currentUrl = new URL(rawUrl);
        } catch {
            throw new OutboundRequestError('invalid_url', 'Outbound URL is invalid');
        }

        for (let redirectCount = 0; redirectCount <= options.maxRedirects; redirectCount += 1) {
            if (!options.allowedProtocols.includes(currentUrl.protocol) || currentUrl.username || currentUrl.password) {
                throw new OutboundRequestError('unsafe_destination', 'Outbound URL protocol or credentials are not allowed');
            }
            if (options.allowedHosts && !options.allowedHosts.includes(normalizeAddress(currentUrl.hostname))) {
                throw new OutboundRequestError('unsafe_destination', 'Outbound host is not allowlisted');
            }

            const target = await resolveTarget(currentUrl);
            const response = await requestOnce(currentUrl, target, options);
            if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
                if (!response.headers.location || redirectCount === options.maxRedirects) {
                    throw new OutboundRequestError('unsafe_redirect', 'Outbound redirect limit exceeded');
                }
                currentUrl = new URL(response.headers.location, currentUrl);
                continue;
            }
            if (response.statusCode < 200 || response.statusCode >= 300) {
                throw new OutboundRequestError('outbound_status', `Outbound server returned ${response.statusCode}`);
            }

            const contentType = `${response.headers['content-type'] || ''}`.split(';', 1)[0].trim().toLowerCase();
            if (options.allowedContentTypes.length && !options.allowedContentTypes.includes(contentType)) {
                throw new OutboundRequestError('unsupported_content_type', 'Outbound response content type is not allowed');
            }
            if (response.body.length > options.maxBytes) {
                throw new OutboundRequestError('response_too_large', 'Outbound response exceeded the byte limit');
            }
            return response.body;
        }
        throw new OutboundRequestError('unsafe_redirect', 'Outbound redirect limit exceeded');
    }

    return { get };
}

module.exports = { OutboundRequestError, createSafeHttpClient, isPublicAddress };
