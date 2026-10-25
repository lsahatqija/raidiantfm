require('dotenv-flow').config();
const mongoose = require('mongoose');
const { loadRuntimeConfig } = require('./config/runtime-config');
const { createApp } = require('./app');
const connectDatabase = require('./startup/db');
const { createGracefulShutdown } = require('./startup/graceful-shutdown');
const { logger } = require('./services/logger.service');

async function main() {
    const runtimeConfig = loadRuntimeConfig();
    await connectDatabase(runtimeConfig);
    const app = createApp(runtimeConfig);
    const server = app.listen(runtimeConfig.server.port, () => {
        logger.info({ event: 'server_started', port: runtimeConfig.server.port });
    });
    const shutdown = createGracefulShutdown({ server, database: mongoose, logger });
    process.once('SIGTERM', () => shutdown('SIGTERM'));
    process.once('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error) => {
    logger.error({ event: 'startup_failed', errorCode: error.cause?.code || error.code || error.name });
    process.exitCode = 1;
});
