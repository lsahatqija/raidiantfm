const mongoose = require('mongoose');
const { seedSystemTopics } = require('./seedTopics');
const { logger } = require('../services/logger.service');
const userService = require('../services/user.service');

module.exports = async function connectDB(runtimeConfig) {
    try {
        await mongoose.connect(runtimeConfig.database.uri);
        logger.info({ event: 'database_connected' });
        await userService.purgeDeprecatedPersonalData();
        await seedSystemTopics();
    } catch (err) {
        throw new Error('MongoDB connection failed', { cause: err });
    }
};
