const spotifyApi = require('../startup/spotify');
const userService = require('../services/user.service');
const Topic = require('../models/topic.model');
const radioHostService = require('../services/radioHost.service');

/**
 * Resolve the current authenticated user from the Spotify Bearer token.
 * Returns the Mongoose user doc, or sends a 401/404 response and returns null.
 */
async function resolveUser(req, res) {
    let meData;
    try {
        meData = await spotifyApi.getMe();
    } catch (err) {
        const statusCode = err?.statusCode === 401 ? 401 : 500;
        res.status(statusCode).json({ error: 'Unable to identify Spotify user' });
        return null;
    }

    const spotifyId = meData.body?.id;
    if (!spotifyId) {
        res.status(401).json({ error: 'Unable to identify Spotify user' });
        return null;
    }

    const user = await userService.findBySpotifyId(spotifyId);
    if (!user) {
        res.status(404).json({ error: 'User not found. Log in via Spotify to create your profile.' });
        return null;
    }

    return user;
}

/**
 * Validate that a string is a valid http or https URL.
 */
function isValidHttpUrl(str) {
    try {
        const u = new URL(str);
        return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
        return false;
    }
}

/**
 * GET /api/radio/topics
 * Returns all enabled public topics and topics owned by the current user.
 */
async function getTopics(req, res) {
    try {
        const user = await resolveUser(req, res);
        if (!user) return;

        const topics = await Topic.find({
            enabled: true,
            $or: [
                { isPublic: true },
                { createdBy: user._id },
            ],
        });

        return res.json({ topics });
    } catch (err) {
        console.error('Error in getTopics:', err);
        return res.status(500).json({ error: 'Error fetching topics' });
    }
}

/**
 * POST /api/radio/topics
 * Create a custom topic owned by the current user.
 */
async function createTopic(req, res) {
    try {
        const user = await resolveUser(req, res);
        if (!user) return;

        const { name, description, category, sources } = req.body || {};

        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return res.status(400).json({ error: 'name is required' });
        }

        if (!Array.isArray(sources)) {
            return res.status(400).json({ error: 'sources must be an array' });
        }

        if (sources.length > 5) {
            return res.status(400).json({ error: 'sources may contain at most 5 URLs' });
        }

        for (const src of sources) {
            if (!isValidHttpUrl(src)) {
                return res.status(400).json({ error: `Invalid source URL: ${src}` });
            }
        }

        // TODO: custom RSS URLs require SSRF protection before this goes to production.

        const slugBase = name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        const slug = `${slugBase}-${Date.now()}`;

        const topic = await Topic.create({
            name: name.trim(),
            slug,
            description: description || '',
            category: category || 'custom',
            sources,
            createdBy: user._id,
            isSystemTopic: false,
            isPublic: false,
            enabled: true,
        });

        return res.status(201).json({ topic });
    } catch (err) {
        console.error('Error in createTopic:', err);
        return res.status(500).json({ error: 'Error creating topic' });
    }
}

/**
 * GET /api/radio/my-topics
 * Return the current user's topic subscriptions with populated topic data.
 */
async function getMyTopics(req, res) {
    try {
        const user = await resolveUser(req, res);
        if (!user) return;

        await user.populate('topics.topicId');

        return res.json({ topics: user.topics });
    } catch (err) {
        console.error('Error in getMyTopics:', err);
        return res.status(500).json({ error: 'Error fetching user topics' });
    }
}

/**
 * POST /api/radio/my-topics/:topicId
 * Subscribe the current user to a topic (or re-enable an existing disabled subscription).
 */
async function subscribeTopic(req, res) {
    try {
        const user = await resolveUser(req, res);
        if (!user) return;

        const { topicId } = req.params;
        const { priority, preferredTone } = req.body || {};

        const topic = await Topic.findById(topicId);
        if (!topic) {
            return res.status(404).json({ error: 'Topic not found' });
        }

        const existing = user.topics.find(
            (t) => t.topicId && t.topicId.toString() === topicId
        );

        if (existing) {
            existing.enabled = true;
            if (priority !== undefined) existing.priority = priority;
            if (preferredTone !== undefined) existing.preferredTone = preferredTone;
        } else {
            user.topics.push({
                topicId,
                enabled: true,
                priority: priority !== undefined ? priority : 1,
                preferredTone: preferredTone || 'casual',
            });
        }

        await user.save();
        await user.populate('topics.topicId');

        return res.json({ topics: user.topics });
    } catch (err) {
        console.error('Error in subscribeTopic:', err);
        return res.status(500).json({ error: 'Error subscribing to topic' });
    }
}

/**
 * DELETE /api/radio/my-topics/:topicId
 * Soft-disable the topic in the user's subscription list.
 */
async function unsubscribeTopic(req, res) {
    try {
        const user = await resolveUser(req, res);
        if (!user) return;

        const { topicId } = req.params;

        const entry = user.topics.find(
            (t) => t.topicId && t.topicId.toString() === topicId
        );

        if (!entry) {
            return res.status(404).json({ error: 'Topic subscription not found' });
        }

        entry.enabled = false;
        await user.save();

        return res.json({ success: true });
    } catch (err) {
        console.error('Error in unsubscribeTopic:', err);
        return res.status(500).json({ error: 'Error unsubscribing from topic' });
    }
}

/**
 * POST /api/radio/host-blurb
 * Generate and return a radio host blurb for the current user.
 * Body (optional):
 * {
 *   previousTrack: { name, artist },
 *   nextTrack: { name, artist },
 *   weatherUnits: 'metric' | 'imperial'
 * }
 */
async function getHostBlurb(req, res) {
    try {
        const user = await resolveUser(req, res);
        if (!user) return;

        const { previousTrack, nextTrack, weatherUnits, hostPersonality } = req.body || {};

        const VALID_PERSONALITIES = ['calm', 'smooth', 'deep', 'energetic', 'cool', 'witty', 'serious', 'playful', 'sardonic'];

        const trackContext = {};
        if (previousTrack && typeof previousTrack === 'object') {
            trackContext.previousTrack = {
                name: typeof previousTrack.name === 'string' ? previousTrack.name.slice(0, 200) : undefined,
                artist: typeof previousTrack.artist === 'string' ? previousTrack.artist.slice(0, 200) : undefined,
            };
        }
        if (nextTrack && typeof nextTrack === 'object') {
            trackContext.nextTrack = {
                name: typeof nextTrack.name === 'string' ? nextTrack.name.slice(0, 200) : undefined,
                artist: typeof nextTrack.artist === 'string' ? nextTrack.artist.slice(0, 200) : undefined,
            };
        }
        trackContext.weatherUnits = weatherUnits === 'imperial' ? 'imperial' : 'metric';
        trackContext.hostPersonality = VALID_PERSONALITIES.includes(hostPersonality) ? hostPersonality : 'smooth';

        const result = await radioHostService.getRadioHostBlurbForUser(user._id, trackContext);

        return res.json(result);
    } catch (err) {
        console.error('Error in getHostBlurb:', err);
        return res.status(500).json({ error: 'Error generating radio host blurb' });
    }
}

module.exports = { getTopics, createTopic, getMyTopics, subscribeTopic, unsubscribeTopic, getHostBlurb };
