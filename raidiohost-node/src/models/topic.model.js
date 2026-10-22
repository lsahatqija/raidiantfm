const mongoose = require('mongoose');

const topicSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            maxlength: 128,
        },
        slug: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },
        description: {
            type: String,
            default: '',
        },
        category: {
            type: String,
            enum: ['news', 'technology', 'gaming', 'music', 'sports', 'local', 'entertainment', 'custom'],
            default: 'custom',
        },
        sources: {
            type: [String],
            default: [],
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
        isSystemTopic: {
            type: Boolean,
            default: false,
        },
        isPublic: {
            type: Boolean,
            default: false,
        },
        requiresLocation: {
            type: Boolean,
            default: false,
        },
        enabled: {
            type: Boolean,
            default: true,
        },
        tones: {
            type: [String],
            enum: [
                'casual',
                'serious',
                'happy',
                'sad',
                'curious',
                'urgent',
                'optimistic',
                'professional',
            ],
            default: [],
        },
    },
    { timestamps: true }
);

const Topic = mongoose.model('Topic', topicSchema);

module.exports = Topic;