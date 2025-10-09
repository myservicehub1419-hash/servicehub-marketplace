const express = require('express');
const { body } = require('express-validator');
const paymentController = require('../controllers/paymentController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Validation rules
const createPaymentIntentValidation = [
    body('bookingId').isMongoId().withMessage('Valid booking ID required')
];

const confirmPaymentValidation = [
    body('paymentIntentId').notEmpty().withMessage('Payment intent ID required'),
    body('paymentId').notEmpty().withMessage('Payment ID required')
];

const refundValidation = [
    body('reason').trim().isLength({ min: 10, max: 500 }).withMessage('Reason must be 10-500 characters')
];

// Public webhook route (must be before authentication middleware)
router.post('/webhook/stripe', express.raw({ type: 'application/json' }), paymentController.handleStripeWebhook);

// Protected routes
router.use(authenticate);

// Customer payment routes
router.post('/create-intent', authorize('customer'), createPaymentIntentValidation, paymentController.createPaymentIntent);
router.post('/confirm', authorize('customer'), confirmPaymentValidation, paymentController.confirmPayment);
router.post('/refund/:paymentId', authorize('customer'), refundValidation, paymentController.requestRefund);

// Common payment routes (customer and provider)
router.get('/:paymentId', paymentController.getPaymentDetails);

// Admin/System routes for payout processing
router.post('/process-payouts', authorize('admin'), paymentController.processPayouts);

module.exports = router;
