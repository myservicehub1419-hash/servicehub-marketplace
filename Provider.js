const express = require('express');
const { body, query } = require('express-validator');
const providerController = require('../controllers/providerController');
const { authenticate, authorize, requireApprovedProvider, requireVerification } = require('../middleware/auth');
const { uploadConfigs, handleUploadError } = require('../middleware/upload');

const router = express.Router();

// Apply middleware to all routes
router.use(authenticate);
router.use(authorize('provider'));
router.use(requireVerification);

// Validation rules
const updateProfileValidation = [
    body('firstName').optional().trim().isLength({ min: 2, max: 50 }).withMessage('First name must be 2-50 characters'),
    body('lastName').optional().trim().isLength({ min: 2, max: 50 }).withMessage('Last name must be 2-50 characters'),
    body('phone').optional().isMobilePhone('en-IN').withMessage('Valid phone number required'),
    body('businessName').optional().trim().isLength({ min: 2, max: 100 }).withMessage('Business name must be 2-100 characters'),
    body('description').optional().trim().isLength({ max: 1000 }).withMessage('Description too long'),
    body('portfolio').optional().isArray().withMessage('Portfolio must be an array')
];

const createServiceValidation = [
    body('title').trim().isLength({ min: 10, max: 100 }).withMessage('Title must be 10-100 characters'),
    body('description').trim().isLength({ min: 50, max: 2000 }).withMessage('Description must be 50-2000 characters'),
    body('shortDescription').trim().isLength({ min: 20, max: 200 }).withMessage('Short description must be 20-200 characters'),
    body('category').notEmpty().withMessage('Category is required'),
    body('subcategory').notEmpty().withMessage('Subcategory is required'),
    body('pricing').isObject().withMessage('Pricing object is required'),
    body('pricing.type').isIn(['fixed', 'hourly', 'package']).withMessage('Invalid pricing type'),
    body('pricing.basePrice').isFloat({ min: 1 }).withMessage('Base price must be positive'),
    body('pricing.packages').isArray({ min: 1 }).withMessage('At least one package required'),
    body('deliveryTime').isInt({ min: 1, max: 365 }).withMessage('Delivery time must be 1-365 days'),
    body('revisions').optional().isInt({ min: 0, max: 10 }).withMessage('Revisions must be 0-10'),
    body('tags').optional().isArray().withMessage('Tags must be an array')
];

const updateServiceValidation = [
    body('title').optional().trim().isLength({ min: 10, max: 100 }).withMessage('Title must be 10-100 characters'),
    body('description').optional().trim().isLength({ min: 50, max: 2000 }).withMessage('Description must be 50-2000 characters'),
    body('pricing').optional().isObject().withMessage('Pricing must be an object'),
    body('deliveryTime').optional().isInt({ min: 1, max: 365 }).withMessage('Delivery time must be 1-365 days')
];

const serviceStatusValidation = [
    body('status').isIn(['draft', 'active', 'paused', 'inactive']).withMessage('Invalid status')
];

const messageValidation = [
    body('message').trim().isLength({ min: 1, max: 1000 }).withMessage('Message must be 1-1000 characters')
];

const deliverWorkValidation = [
    body('message').optional().trim().isLength({ max: 500 }).withMessage('Message too long'),
    body('deliverables').optional().isArray().withMessage('Deliverables must be an array')
];

const reviewResponseValidation = [
    body('response').trim().isLength({ min: 10, max: 500 }).withMessage('Response must be 10-500 characters')
];

// Dashboard and profile routes
router.get('/dashboard', providerController.getDashboard);
router.get('/profile', providerController.getProfile);
router.put('/profile', updateProfileValidation, providerController.updateProfile);

// Service management routes (requires approved provider)
router.use(requireApprovedProvider);

router.post('/service', createServiceValidation, providerController.createService);
router.get('/services', providerController.getServices);
router.get('/service/:serviceId', providerController.getServiceDetails);
router.put('/service/:serviceId', updateServiceValidation, providerController.updateService);
router.patch('/service/:serviceId/status', serviceStatusValidation, providerController.toggleServiceStatus);

// Booking management routes
router.get('/bookings', providerController.getBookings);
router.get('/booking/:bookingId', providerController.getBookingDetails);
router.post('/booking/:bookingId/accept', providerController.acceptBooking);
router.post('/booking/:bookingId/start', providerController.startWork);
router.post('/booking/:bookingId/deliver', deliverWorkValidation, providerController.deliverWork);

// Communication routes
router.post('/booking/:bookingId/message', messageValidation, providerController.sendMessage);

// Financial routes
router.get('/earnings', providerController.getEarnings);
router.get('/analytics', providerController.getAnalytics);

// Review management
router.post('/review/:reviewId/respond', reviewResponseValidation, providerController.respondToReview);

// File upload routes
router.post('/service/upload-images', uploadConfigs.serviceImages, handleUploadError, (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({
            success: false,
            message: 'No images uploaded'
        });
    }

    const images = req.files.map((file, index) => ({
        url: `/uploads/services/${file.filename}`,
        alt: `Service image ${index + 1}`,
        isPrimary: index === 0
    }));

    res.json({
        success: true,
        message: 'Images uploaded successfully',
        data: { images }
    });
});

router.post('/portfolio/upload', uploadConfigs.portfolio, handleUploadError, (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({
            success: false,
            message: 'No portfolio files uploaded'
        });
    }

    const portfolioItems = req.files.map(file => ({
        title: file.originalname,
        image: `/uploads/portfolio/${file.filename}`,
        description: ''
    }));

    res.json({
        success: true,
        message: 'Portfolio items uploaded successfully',
        data: { portfolioItems }
    });
});

router.post('/booking/:bookingId/upload-deliverables', uploadConfigs.deliverables, handleUploadError, (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({
            success: false,
            message: 'No deliverable files uploaded'
        });
    }

    const deliverables = req.files.map(file => ({
        filename: file.originalname,
        url: `/uploads/deliverables/${file.filename}`,
        description: '',
        deliveredAt: new Date()
    }));

    res.json({
        success: true,
        message: 'Deliverables uploaded successfully',
        data: { deliverables }
    });
});

module.exports = router;
