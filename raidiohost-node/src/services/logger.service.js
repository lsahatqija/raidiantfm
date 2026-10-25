const crypto = require('node:crypto');

const REDACTED_FIELD = /^(authorization|cookie|.*token|.*secret|password|email|latitude|longitude|coordinates?|code)$/i;

function redact(value, key = '') {
    if (REDACTED_FIELD.test(key)) return '[REDACTED]';
    if (Array.isArray(value)) return value.map((entry) => redact(entry));
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, redact(childValue, childKey)]));
    }
    return value;
}

function createLogger({ write = (line) => process.stdout.write(`${line}\n`), base = {} } = {}) {
    function emit(level, fields = {}) {
        write(JSON.stringify(redact({ timestamp: new Date().toISOString(), level, ...base, ...fields })));
    }
    return {
        debug: (fields) => emit('debug', fields),
        info: (fields) => emit('info', fields),
        warn: (fields) => emit('warn', fields),
        error: (fields) => emit('error', fields),
        child: (fields) => createLogger({ write, base: { ...base, ...fields } }),
    };
}

function createRequestContext(logger) {
    return function requestContext(request, response, next) {
        const suppliedId = `${request.get('X-Request-Id') || ''}`;
        const requestId = /^[A-Za-z0-9._-]{1,64}$/.test(suppliedId) ? suppliedId : crypto.randomUUID();
        const startedAt = process.hrtime.bigint();
        request.id = requestId;
        request.log = logger.child({ requestId, entryPoint: 'http' });
        response.set('X-Request-Id', requestId);
        response.once('finish', () => {
            const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
            request.log.info({
                event: 'request_completed',
                method: request.method,
                path: request.path,
                status: response.statusCode,
                durationMs: Math.round(durationMs * 10) / 10,
            });
        });
        next();
    };
}

const logger = createLogger({ base: { entryPoint: 'process' } });

module.exports = { createLogger, createRequestContext, logger, redact };
