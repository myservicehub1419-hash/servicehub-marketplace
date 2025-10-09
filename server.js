const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const compression = require('compression');
const path = require('path');
require('dotenv').config();

// Import database connection
const database = require('./backend/config/database');

// Import routes
const authRoutes = require('./backend/routes/auth');
const customerRoutes = require('./backend/routes/customer');
const providerRoutes = require('./backend/routes/provider');
const paymentRoutes = require('./backend/routes/payment');

// Import services
const emailService = require('./backend/services/emailService');

const app = express();

// Trust proxy for rate limiting behind reverse proxy
app.set('trust proxy', 1);

// Compression middleware
app.use(compression());

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
        },
    },
    crossOriginEmbedderPolicy: false
}));

// CORS configuration
app.use(cors({
    origin: function (origin, callback) {
        const allowedOrigins = [
            process.env.FRONTEND_URL || 'http://localhost:3000',
            'http://localhost:3000',
            'http://127.0.0.1:3000'
        ];
        
        // Allow requests with no origin (mobile apps, etc.)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Rate limiting
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: {
        success: false,
        message: 'Too many requests from this IP, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // limit each IP to 5 requests per windowMs for auth routes
    message: {
        success: false,
        message: 'Too many authentication attempts, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Apply general rate limiting to all requests
app.use(generalLimiter);

// Logging middleware
if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
} else {
    app.use(morgan('combined'));
}

// Body parsing middleware
app.use('/api/payment/webhook/stripe', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static file serving
app.use('/uploads', express.static(path.join(__dirname, 'backend/uploads'), {
    maxAge: '1d', // Cache for 1 day
    etag: false
}));

app.use(express.static('backend/public', {
    maxAge: '7d' // Cache static assets for 7 days
}));

// API Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/customer', customerRoutes);
app.use('/api/provider', providerRoutes);
app.use('/api/payment', paymentRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
    const dbStatus = database.getConnectionStatus();
    
    res.status(200).json({
        status: 'OK',
        message: 'ServiceHub API is running',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        database: {
            connected: dbStatus.isConnected,
            status: dbStatus.readyState === 1 ? 'connected' : 'disconnected'
        },
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: process.env.npm_package_version || '1.0.0'
    });
});

// API info endpoint
app.get('/api', (req, res) => {
    res.json({
        name: 'ServiceHub API',
        version: '1.0.0',
        description: 'Backend API for ServiceHub marketplace',
        endpoints: {
            auth: '/api/auth',
            customer: '/api/customer',
            provider: '/api/provider',
            payment: '/api/payment'
        },
        documentation: process.env.API_DOCS_URL || 'https://docs.servicehub.com'
    });
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'API endpoint not found',
        path: req.originalUrl
    });
});

// Serve frontend for all other routes (SPA support)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Global error handling middleware
app.use((err, req, res, next) => {
    console.error('Global error handler:', err);
    
    // Handle specific error types
    if (err.name === 'ValidationError') {
        return res.status(400).json({
            success: false,
            message: 'Validation Error',
            errors: Object.values(err.errors).map(e => e.message)
        });
    }
    
    if (err.name === 'CastError') {
        return res.status(400).json({
            success: false,
            message: 'Invalid ID format'
        });
    }
    
    if (err.code === 11000) {
        const field = Object.keys(err.keyValue)[0];
        return res.status(409).json({
            success: false,
            message: `${field} already exists`
        });
    }

    if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({
            success: false,
            message: 'Invalid token'
        });
    }

    if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
            success: false,
            message: 'Token expired'
        });
    }

    // Default error response
    const statusCode = err.statusCode || 500;
    const message = process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong!';
    
    res.status(statusCode).json({
        success: false,
        message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

// Start server
async function startServer() {
    try {
        // Connect to database
        await database.connect();
        database.setupEventHandlers();
        
        // Initialize email service
        console.log('🚀 Initializing services...');
        
        const PORT = process.env.PORT || 5000;
        const server = app.listen(PORT, () => {
            console.log('🌟 ===============================================');
            console.log('🌟            ServiceHub Backend Started        ');
            console.log('🌟 ===============================================');
            console.log(`🚀 Server running on port: ${PORT}`);
            console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log(`📊 Health check: http://localhost:${PORT}/health`);
            console.log(`📖 API docs: http://localhost:${PORT}/api`);
            console.log('🌟 ===============================================');
        });

        // Graceful shutdown
        process.on('SIGTERM', () => {
            console.log('🛑 SIGTERM received, shutting down gracefully');
            server.close(() => {
                console.log('💤 HTTP server closed');
            });
        });

        return server;
    } catch (error) {
        console.error('❌ Failed to start server:', error.message);
        process.exit(1);
    }
}

// Only start server if this file is run directly
if (require.main === module) {
    startServer();
}

module.exports = app;
