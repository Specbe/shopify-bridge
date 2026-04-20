// Import necessary modules using ES6 syntax
import express from 'express';
import { json } from 'body-parser';
import request from 'request';
import winston from 'winston';

const app = express();
const PORT = process.env.PORT || 3000;
const TIMEOUT = 5000;  // Timeout in milliseconds

// Setup error logging
const logger = winston.createLogger({
    level: 'error',
    format: winston.format.json(),
    transports: [
        new winston.transports.File({ filename: 'error.log' })
    ],
});

// Middleware to handle JSON requests
app.use(json());

// Request tracking middleware
app.use((req, res, next) => {
    const requestId = req.headers['x-request-id'] || Date.now();
    logger.info(`Request ID: ${requestId} - ${req.method} ${req.url}`);
    res.setHeader('X-Request-Id', requestId);
    next();
});

// Route handling
app.post('/shopify-bridge', (req, res) => {
    const { shop, data } = req.body;

    // Example error handling
    if (!shop || !data) {
        logger.error('Missing required fields in request body');
        return res.status(400).send('Bad Request: Missing required fields');
    }

    // Simulate processing the request with a timeout
    const timeoutId = setTimeout(() => {
        logger.error('Request processing timeout');
        res.status(504).send('Gateway Timeout');
    }, TIMEOUT);

    // Simulate sending a request to Shopify
    request({ /* your request options */ }, (error, response, body) => {
        clearTimeout(timeoutId);

        if (error) {
            logger.error(`Error during request to Shopify: ${error.message}`);
            return res.status(500).send('Internal Server Error');
        }

        res.status(response.statusCode).send(body);
    });
});

// Diagnostic on startup
app.listen(PORT, () => {
    logger.info(`Server started on port ${PORT}.`);
});

// Graceful shutdown
const shutdown = () => {
    logger.info('Shutting down gracefully...');
    process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
