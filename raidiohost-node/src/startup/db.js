const mongoose = require('mongoose');
const { seedSystemTopics } = require('./seedTopics');

module.exports = async function connectDB(runtimeConfig) {
    try {
        await mongoose.connect(runtimeConfig.database.uri);
        console.log('MongoDB connected');
        await seedSystemTopics();
    } catch (err) {
        console.error('MongoDB connection error:', err.message);
        process.exit(1);
    }
};
