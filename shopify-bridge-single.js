// Improved Shopify Bridge

require('dotenv').config();
const express = require('express');
const app = express();
const winston = require('winston');

// Logger configuration
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message }) => {
            return `${timestamp} ${level}: ${message}`;
        })
    ),
    transports: [
        new winston.transports.Console(),
    ],
});

// Environment variable validation
const requiredEnvVars = ['API_KEY', 'API_SECRET'];
requiredEnvVars.forEach(varName => {
    if (!process.env[varName]) {
        logger.error(`Missing environment variable: ${varName}`);
        process.exit(1);
    }
});

// Request ID tracking
app.use((req, res, next) => {
    req.requestId = Math.random().toString(36).substr(2, 9);
    logger.info(`Request ID: ${req.requestId}`);
    next();
});

// Graceful shutdown handling
const server = app.listen(process.env.PORT || 3000, () => {
    logger.info(`Server started on port ${process.env.PORT || 3000}`);
});

process.on('SIGTERM', () => {
    logger.info('SIGTERM signal received: closing HTTP server');
    server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
    });
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Example route with comprehensive error handling
app.get('/some-endpoint', (req, res) => {
    // Simulate some processing that could fail
    try {
        // Your business logic here
        throw new Error('Simulated error for demonstration');
    } catch (error) {
        logger.error(`Error in /some-endpoint: ${error.message}`);
        res.status(500).json({
            requestId: req.requestId,
            message: 'Internal Server Error',
            error: error.message,
        });
    }
});

// Example route with timeout protection
app.get('/another-endpoint', (req, res) => {
    const timeout = setTimeout(() => {
        logger.warn(`Request ${req.requestId} timed out`);
        res.status(504).json({
            requestId: req.requestId,
            message: 'Request Timeout'
        });
    }, 5000); // 5 seconds timeout

    // Simulated processing
    setTimeout(() => {
        clearTimeout(timeout);
        res.json({
            requestId: req.requestId,
            message: 'Success!'
        });
    }, 3000); // Simulated delay
});

