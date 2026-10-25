const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
    {
        // Primary identifier: Spotify user ID
        spotifyId: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },

        // Display-only username — defaults to Spotify display_name, user may change it
        username: {
            type: String,
            required: true,
            trim: true,
            maxlength: 64,
        },

        topics: [
            {
                topicId: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'Topic',
                    required: true,
                },
                enabled: {
                    type: Boolean,
                    default: true,
                },
                priority: {
                    type: Number,
                    default: 1,
                },
                preferredTone: {
                    type: String,
                    enum: ['casual', 'serious', 'happy', 'sad', 'curious', 'urgent', 'optimistic', 'professional'],
                    default: 'casual',
                },
                lastServedAt: {
                    type: Date,
                },
            },
        ],

        // Read-only fields synced from Spotify on each login
        spotifyDisplayName: {
            type: String,
            default: '',
        },
        // Encrypted Spotify credentials. The complete subdocument is omitted
        // from JSON so encrypted material and lookup fingerprints stay server-only.
        spotifyCredentials: {
            accessToken: {
                ciphertext: { type: String, required: true },
                iv: { type: String, required: true },
                authTag: { type: String, required: true },
            },
            refreshToken: {
                ciphertext: { type: String, required: true },
                iv: { type: String, required: true },
                authTag: { type: String, required: true },
            },
            refreshTokenHash: {
                type: String,
                required: true,
                select: false,
                index: true,
            },
            expiresAt: {
                type: Date,
                required: true,
            },
            version: {
                type: Number,
                default: 0,
                min: 0,
            },
        },

        // User's geographic location
        location: {
            city: {
                type: String,
                default: '',
            },
            consentAt: {
                type: Date,
                default: null,
            },
        },

        // Last player volume selected by user (0.0 - 1.0)
        lastVolume: {
            type: Number,
            default: 0.5,
            min: 0,
            max: 1,
        },

    },
    {
        timestamps: true,
        toJSON: {
            transform(_document, result) {
                delete result.spotifyCredentials;
                return result;
            },
        },
    }
);

const User = mongoose.model('User', userSchema);

module.exports = User;
