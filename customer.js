const express = require('express');
const { body, query } = require('express-validator');
const customerController = require('../controllers/customerController');
const { authenticate, authorize, requireVerification } = require('../middleware/auth');
const { uploadConfigs, handleUploadError } = require('../middleware/upload');

const router = express.Router();

// Apply middleware to all routes
router.use(authenticate);
router.use(authorize('customer'));
router.use(requireVerification);

// Validation rules
const searchValidation = [
    query('query').optional().trim().isLength({ max: 100 }).withMessage('Search query too long'),
    query('category').optional().trim(),
    query('minPrice').optional().isFloat({ min: 0 }).withMessage('Min price must be positive'),
    query('maxPrice').optional().isFloat({ min: 0 }).withMessage('Max price must be positive'),
    query('rating').optional().isFloat({ min: 1, max: 5 }).withMessage('Rating must be 1-5'),
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive integer'),
    query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be 1-50')
];

const createBookingValidation = [
    body('serviceId').isMongoId().withMessage('Valid service ID required'),
    body('packageName').trim().notEmpty().withMessage('Package name is required'),
    body('customRequirements').optional().trim().isLength({ max: 1000 }).withMessage('Requirements too long')
];

const messageValidation = [
    body('message').trim().isLength({ min: 1, max: 1000 }).withMessage('Message must be 1-1000 characters')
];

const revisionValidation = [
    body('description').trim().isLength({ min: 10, max: 500 }).withMessage('Description must be 10-500 characters')
];

const reviewValidation = [
    body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be 1-5'),
    body('title').trim().isLength({ min: 5, max: 100 }).withMessage('Title must be 5-100 characters'),
    body('comment').trim().isLength({ min: 10, max: 1000 }).withMessage('Comment must be 10-1000 characters'),
    body('detailedRatings').optional().isObject().withMessage('Detailed ratings must be an object')
];

const favoriteValidation = [
    body('providerId').isMongoId().withMessage('Valid provider ID required')
];

// Dashboard and profile routes
router.get('/dashboard', customerController.getDashboard);

// Service discovery routes
router.get('/search', searchValidation, customerController.searchServices);
router.get('/categories', customerController.getCategories);
router.get('/service/:serviceId', customerController.getServiceDetails);

// Booking management routes
router.post('/booking', createBookingValidation, customerController.createBooking);
router.get('/bookings', customerController.getBookings);
router.get('/booking/:bookingId', customerController.getBookingDetails);

// Communication routes
router.post('/booking/:bookingId/message', messageValidation, customerController.sendMessage);

// Order management routes
router.post('/booking/:bookingId/revision', revisionValidation, customerController.requestRevision);
router.post('/booking/:bookingId/accept', customerController.acceptDelivery);

// Review system routes
router.post('/booking/:bookingId/review', reviewValidation, customerController.submitReview);

// Payment and history routes
router.get('/payments', customerController.getPaymentHistory);

// Favorites management
router.post('/favorites', favoriteValidation, customerController.addToFavorites);

// File upload for booking attachments
router.post('/booking/:bookingId/upload', uploadConfigs.documents, handleUploadError, (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({
            success: false,
            message: 'No files uploaded'
        });
    }

    const files = req.files.map(file => ({
        filename: file.originalname,
        url: `/uploads/documents/${file.filename}`,
        uploadedAt: new Date()
    }));

    res.json({
        success: true,
        message: 'Files uploaded successfully',
        data: { files }
    });
});

module.exports = router;
