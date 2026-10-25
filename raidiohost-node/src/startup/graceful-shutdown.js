function createGracefulShutdown({ server, database, logger, exit = process.exit, timeoutMs = 10_000 }) {
    let shuttingDown = false;
    return async function shutdown(signal) {
        if (shuttingDown) return;
        shuttingDown = true;
        logger.info({ event: 'shutdown_started', signal });
        const forceTimer = setTimeout(() => {
            logger.error({ event: 'shutdown_forced', signal });
            exit(1);
        }, timeoutMs);
        forceTimer.unref?.();

        try {
            await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
            await database.disconnect();
            clearTimeout(forceTimer);
            logger.info({ event: 'shutdown_completed', signal });
        } catch (error) {
            clearTimeout(forceTimer);
            logger.error({ event: 'shutdown_failed', signal, errorCode: error.code || error.name });
            exit(1);
        }
    };
}

module.exports = { createGracefulShutdown };
