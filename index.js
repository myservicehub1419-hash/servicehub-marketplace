const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true
}));

// Database connection
const connectDB = async () => {
    try {
        if (process.env.MONGODB_URI) {
            await mongoose.connect(process.env.MONGODB_URI);
            console.log('MongoDB connected successfully');
        } else {
            console.log('Running without database - using in-memory storage');
        }
    } catch (error) {
        console.error('Database connection error:', error);
        process.exit(1);
    }
};

// Basic middleware for logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'ServiceHub Backend is running',
        timestamp: new Date().toISOString()
    });
});

// Authentication middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret', (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid token' });
        }
        req.user = user;
        next();
    });
};

// Routes

// User/Provider Registration
app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password, userType, businessName, services, location } = req.body;

        // Basic validation
        if (!email || !password || !userType) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // In a real app, save to database
        const userData = {
            id: Date.now(),
            email,
            userType, // 'customer' or 'provider'
            businessName: userType === 'provider' ? businessName : undefined,
            services: userType === 'provider' ? services : undefined,
            location,
            createdAt: new Date().toISOString()
        };

        res.status(201).json({ 
            message: 'Registration successful', 
            user: userData 
        });
    } catch (error) {
        res.status(500).json({ error: 'Registration failed' });
    }
});

// User Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // In a real app, validate against database
        const token = jwt.sign(
            { email, id: Date.now() }, 
            process.env.JWT_SECRET || 'fallback_secret',
            { expiresIn: '24h' }
        );

        res.json({ 
            message: 'Login successful',
            token,
            user: { email, id: Date.now() }
        });
    } catch (error) {
        res.status(500).json({ error: 'Login failed' });
    }
});

// Service Categories
app.get('/api/categories', (req, res) => {
    const categories = [
        { id: 1, name: 'Home Services', subcategories: ['Cleaning', 'Plumbing', 'Electrical'] },
        { id: 2, name: 'Professional Services', subcategories: ['Legal', 'Accounting', 'Consulting'] },
        { id: 3, name: 'Digital Services', subcategories: ['Web Design', 'Marketing', 'Photography'] },
        { id: 4, name: 'Automotive', subcategories: ['Repair', 'Detailing', 'Towing'] }
    ];

    res.json(categories);
});

// Service Providers
app.get('/api/providers', (req, res) => {
    const { category, location, search } = req.query;

    // Mock data - in real app, query database
    const providers = [
        {
            id: 1,
            businessName: 'Quick Clean Services',
            category: 'Home Services',
            services: ['House Cleaning', 'Office Cleaning'],
            location: 'Mumbai',
            rating: 4.5,
            reviewCount: 25
        }
    ];

    res.json(providers);
});

// Provider Dashboard - Orders
app.get('/api/provider/orders', authenticateToken, (req, res) => {
    const orders = [
        {
            id: 1,
            customerName: 'John Doe',
            service: 'House Cleaning',
            status: 'pending',
            scheduledDate: '2025-09-25',
            amount: 2500,
            createdAt: '2025-09-22T13:00:00Z'
        }
    ];

    res.json(orders);
});

// Accept/Reject Orders
app.put('/api/provider/orders/:orderId', authenticateToken, (req, res) => {
    const { orderId } = req.params;
    const { status } = req.body;

    // In real app, update database
    res.json({ 
        message: `Order ${orderId} ${status}`,
        orderId,
        status,
        updatedAt: new Date().toISOString()
    });
});

// Create Service Order
app.post('/api/orders', authenticateToken, (req, res) => {
    try {
        const { providerId, service, scheduledDate, location, notes } = req.body;

        const order = {
            id: Date.now(),
            providerId,
            customerId: req.user.id,
            service,
            scheduledDate,
            location,
            notes,
            status: 'pending',
            createdAt: new Date().toISOString()
        };

        res.status(201).json({ 
            message: 'Order created successfully',
            order 
        });
    } catch (error) {
        res.status(500).json({ error: 'Order creation failed' });
    }
});

// Payment Integration (placeholder)
app.post('/api/payments/create', authenticateToken, (req, res) => {
    const { orderId, amount } = req.body;

    // Integrate with payment gateway (Razorpay, Stripe, etc.)
    res.json({
        paymentId: `pay_${Date.now()}`,
        orderId,
        amount,
        status: 'created'
    });
});

// AI-powered Service Recommendations (placeholder)
app.get('/api/recommendations', authenticateToken, (req, res) => {
    const { userLocation, serviceHistory } = req.query;

    // AI logic would go here
    const recommendations = [
        { service: 'House Cleaning', confidence: 0.85, reason: 'Based on your location and season' },
        { service: 'AC Maintenance', confidence: 0.72, reason: 'Popular in your area this month' }
    ];

    res.json(recommendations);
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Error:', error);
    res.status(500).json({ 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// Start server
const startServer = async () => {
    await connectDB();

    app.listen(PORT, () => {
        console.log(`🚀 ServiceHub Backend running on port ${PORT}`);
        console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
        console.log(`🌟 Environment: ${process.env.NODE_ENV || 'development'}`);
    });
};

startServer().catch(console.error);

module.exports = app;