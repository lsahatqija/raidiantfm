const express = require('express');
const router = express.Router();
const spotifyApi = require('../startup/spotify');
const userService = require('../services/user.service');

// Module-level cache so /auth/token can return the full token payload.
let cachedTokenMeta = { refreshToken: null, expiresIn: 3600 };
// Single interval handle — prevents duplicate refresh loops on multiple logins.
let refreshInterval = null;

router.get('/login', (req, res) => {
    const scopes = ['streaming', 'user-read-private', 'user-read-email',
        'user-top-read', 'user-library-read',
        'playlist-read-private', 'playlist-read-collaborative', 'playlist-modify-public', 'playlist-modify-private',
        'user-read-playback-state', 'user-read-currently-playing', 'user-modify-playback-state'];
    const authUrl = spotifyApi.createAuthorizeURL(scopes, undefined, true);
    res.redirect(authUrl);
});

router.get('/callback', async (req, res) => {
    const code = req.query.code;
    const error = req.query.error;

    if (error) {
        console.error('Callback Error:', error);
        return res.send(`Callback Error: ${error}`);
    }

    spotifyApi.authorizationCodeGrant(code).then(async data => {
        const accessToken = data.body['access_token'];
        const refreshToken = data.body['refresh_token'];
        const expiresIn = data.body['expires_in'];

        spotifyApi.setAccessToken(accessToken);
        spotifyApi.setRefreshToken(refreshToken);
        cachedTokenMeta = { refreshToken, expiresIn };

        // Upsert user in MongoDB — wrapped so DB errors never break the auth flow.
        try {
            const meData = await spotifyApi.getMe();
            const user = await userService.upsertUser(meData.body, {
                accessToken,
                refreshToken,
                tokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
            });

            // Auto-detect location from IP on first sign-in (only when no location is stored).
            if (!user.location?.city) {
                try {
                    const rawIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
                        || req.socket?.remoteAddress
                        || '';
                    const ip = rawIp.replace(/^::ffff:/, '');
                    const isPrivate = !ip
                        || ip === '127.0.0.1'
                        || ip === '::1'
                        || /^10\./.test(ip)
                        || /^192\.168\./.test(ip)
                        || /^172\.(1[6-9]|2\d|3[01])\./.test(ip);

                    if (!isPrivate) {
                        const geoRes = await fetch(
                            `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,city,country,lat,lon`
                        );
                        if (geoRes.ok) {
                            const geo = await geoRes.json();
                            if (geo.status === 'success' && geo.city) {
                                const cityDisplay = geo.country ? `${geo.city}, ${geo.country}` : geo.city;
                                await userService.updateLocation(user.spotifyId, {
                                    city: cityDisplay,
                                    latitude: geo.lat,
                                    longitude: geo.lon,
                                });
                            }
                        }
                    }
                } catch (geoErr) {
                    console.warn('IP geolocation failed (non-fatal):', geoErr.message);
                }
            }
        } catch (dbErr) {
            console.error('User upsert failed (non-fatal):', dbErr.message);
        }

        clearInterval(refreshInterval);
        refreshInterval = setInterval(async () => {
            const data = await spotifyApi.refreshAccessToken();
            const accessToken = data.body['access_token'];
            spotifyApi.setAccessToken(accessToken);
            console.log('The access token has been refreshed!');

            // Keep stored token in sync — non-fatal if it fails.
            try {
                const meData = await spotifyApi.getMe();
                const spotifyId = meData.body?.id;
                if (spotifyId) {
                    await userService.updateAccessToken(spotifyId, {
                        accessToken,
                        tokenExpiresAt: new Date(Date.now() + (expiresIn - 60) * 1000),
                    });
                }
            } catch (dbErr) {
                console.error('Token refresh DB update failed (non-fatal):', dbErr.message);
            }
        }, (expiresIn - 60) * 1000);


        const jsondata = {
            accessToken: accessToken,
            refreshToken: refreshToken,
            expiresIn: expiresIn
        };
        
        console.log('Authorization granted. Stringified json:', JSON.stringify(jsondata));

        return res.send(`
            <!doctype html>
            <html>
                <body style="font-family: sans-serif; padding: 16px;">
                    <p>Spotify login complete. You can close this window.</p>
                    <p>Access Token: ${accessToken}</p>
                    <p>Refresh Token: ${refreshToken}</p>
                    <p>Expires In: ${expiresIn} seconds</p>
                    <script>
                        try {
                            window.opener?.postMessage(${JSON.stringify(jsondata)}, '*');
                        } catch (error) {
                            console.error('Unable to send Spotify auth result to opener:', error);
                        }

                        <!-- window.setTimeout(() => window.close(), 1000); -->
                        window.setTimeout(() => window.close(), 1000);
                    </script>
                </body>
            </html>
        `);
    })
    .catch(error => {
        console.error('Error getting Tokens:', error);
        res.status(500).send(`Error getting Tokens: ${error}`);
    });    
});

router.post('/refresh', async (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) {
        return res.status(400).json({ error: 'refreshToken is required' });
    }
    try {
        spotifyApi.setRefreshToken(refreshToken);
        const data = await spotifyApi.refreshAccessToken();
        const accessToken = data.body['access_token'];
        const expiresIn = data.body['expires_in'] ?? cachedTokenMeta.expiresIn;

        spotifyApi.setAccessToken(accessToken);
        cachedTokenMeta = { ...cachedTokenMeta, expiresIn };

        // Sync DB — non-fatal if it fails.
        try {
            const user = await userService.findByRefreshToken(refreshToken);
            if (user?.spotifyId) {
                await userService.updateAccessToken(user.spotifyId, {
                    accessToken,
                    tokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
                });
            }
        } catch (dbErr) {
            console.error('Token refresh DB update failed (non-fatal):', dbErr.message);
        }

        return res.json({ accessToken, expiresIn });
    } catch (err) {
        console.error('Token refresh failed:', err);
        return res.status(err.statusCode ?? 400).json({ error: err.message ?? 'Token refresh failed' });
    }
});

router.get('/token', (req, res) => {
    const accessToken = spotifyApi.getAccessToken();
    if (!accessToken) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    return res.json({
        accessToken,
        refreshToken: cachedTokenMeta.refreshToken,
        expiresIn: cachedTokenMeta.expiresIn,
    });
});

router.get('/tokens', (req, res) => {
    const code = req.query.code;

    if (!code) {
        return res.status(400).json({ error: 'Authorization code is required' });
    }

    spotifyApi.authorizationCodeGrant(code).then(data => {
        const accessToken = data.body['access_token'];
        const refreshToken = data.body['refresh_token'];
        const expiresIn = data.body['expires_in'];
        spotifyApi.setAccessToken(accessToken);
        spotifyApi.setRefreshToken(refreshToken);

        console.log('Authorization Code:', code);
        console.log('Access Token:', accessToken);
        console.log('Refresh Token:', refreshToken);
        console.log(`Successfully retrieved access token. Expires in ${expiresIn} s.`);

        return res.json({
            accessToken,
            refreshToken,
            expiresIn
        });
    })
    .catch(error => {
        console.error('Error getting Tokens:', error);
        res.status(500).json({ error: 'Error getting Tokens' });
    });
});

module.exports = router;