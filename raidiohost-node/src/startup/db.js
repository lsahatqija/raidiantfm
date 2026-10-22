const mongoose = require('mongoose');
const { seedSystemTopics } = require('./seedTopics');

module.exports = async function connectDB() {
    const uri = process.env.MONGODB_URI;

    if (!uri) {
        throw new Error('FATAL ERROR: MONGODB_URI is not defined!');
    }

    try {
        await mongoose.connect(uri);
        console.log('MongoDB connected');
        await seedSystemTopics();
    } catch (err) {
        console.error('MongoDB connection error:', err.message);
        process.exit(1);
    }
};
