const { body, param, query } = require('express-validator');

class ValidationSchemas {
    // Authentication validations
    static register() {
        return [
            body('firstName')
                .trim()
                .isLength({ min: 2, max: 50 })
                .withMessage('First name must be 2-50 characters')
                .matches(/^[a-zA-Z\s]+$/)
                .withMessage('First name can only contain letters and spaces'),
            
            body('lastName')
                .trim()
                .isLength({ min: 2, max: 50 })
                .withMessage('Last name must be 2-50 characters')
                .matches(/^[a-zA-Z\s]+$/)
                .withMessage('Last name can only contain letters and spaces'),
            
            body('email')
                .isEmail()
                .withMessage('Please provide a valid email')
                .normalizeEmail()
                .isLength({ max: 100 })
                .withMessage('Email too long'),
            
            body('password')
                .isLength({ min: 8, max: 128 })
                .withMessage('Password must be 8-128 characters')
                .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
                .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number and one special character'),
            
            body('phone')
                .isMobilePhone('en-IN')
                .withMessage('Please provide a valid Indian mobile number'),
            
            body('userType')
                .isIn(['customer', 'provider'])
                .withMessage('User type must be either customer or provider'),
            
            body('businessName')
                .optional()
                .trim()
                .isLength({ min: 2, max: 100 })
                .withMessage('Business name must be 2-100 characters'),
            
            body('termsAccepted')
                .equals('true')
                .withMessage('You must accept the terms and conditions')
        ];
    }

    static login() {
        return [
            body('email')
                .isEmail()
                .withMessage('Please provide a valid email')
                .normalizeEmail(),
            
            body('password')
                .notEmpty()
                .withMessage('Password is required'),
            
            body('rememberMe')
                .optional()
                .isBoolean()
                .withMessage('Remember me must be a boolean')
        ];
    }

    static forgotPassword() {
        return [
            body('email')
                .isEmail()
                .withMessage('Please provide a valid email')
                .normalizeEmail()
        ];
    }

    static resetPassword() {
        return [
            param('token')
                .isLength({ min: 64, max: 64 })
                .withMessage('Invalid reset token'),
            
            body('password')
                .isLength({ min: 8, max: 128 })
                .withMessage('Password must be 8-128 characters')
                .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
                .withMessage('Password must contain uppercase, lowercase, number and special character')
        ];
    }

    static changePassword() {
        return [
            body('currentPassword')
                .notEmpty()
                .withMessage('Current password is required'),
            
            body('newPassword')
                .isLength({ min: 8, max: 128 })
                .withMessage('New password must be 8-128 characters')
                .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
                .withMessage('New password must contain uppercase, lowercase, number and special character')
        ];
    }

    // Service validations
    static createService() {
        return [
            body('title')
                .trim()
                .isLength({ min: 10, max: 100 })
                .withMessage('Service title must be 10-100 characters'),
            
            body('description')
                .trim()
                .isLength({ min: 50, max: 2000 })
                .withMessage('Description must be 50-2000 characters'),
            
            body('shortDescription')
                .trim()
                .isLength({ min: 20, max: 200 })
                .withMessage('Short description must be 20-200 characters'),
            
            body('category')
                .notEmpty()
                .withMessage('Category is required')
                .isIn([
                    'web-development', 'mobile-development', 'ui-ux-design',
                    'digital-marketing', 'content-writing', 'seo',
                    'graphic-design', 'video-editing', 'photography',
                    'consulting', 'data-entry', 'virtual-assistant',
                    'accounting', 'legal', 'translation', 'tutoring'
                ])
                .withMessage('Invalid category'),
            
            body('subcategory')
                .trim()
                .isLength({ min: 2, max: 50 })
                .withMessage('Subcategory must be 2-50 characters'),
            
            body('pricing')
                .isObject()
                .withMessage('Pricing must be an object'),
            
            body('pricing.type')
                .isIn(['fixed', 'hourly', 'package'])
                .withMessage('Pricing type must be fixed, hourly, or package'),
            
            body('pricing.basePrice')
                .isFloat({ min: 1, max: 1000000 })
                .withMessage('Base price must be between ₹1 and ₹10,00,000'),
            
            body('pricing.packages')
                .isArray({ min: 1, max: 5 })
                .withMessage('Must have 1-5 pricing packages'),
            
            body('pricing.packages.*.name')
                .trim()
                .isLength({ min: 3, max: 50 })
                .withMessage('Package name must be 3-50 characters'),
            
            body('pricing.packages.*.price')
                .isFloat({ min: 1 })
                .withMessage('Package price must be positive'),
            
            body('pricing.packages.*.deliveryDays')
                .isInt({ min: 1, max: 365 })
                .withMessage('Delivery days must be 1-365'),
            
            body('deliveryTime')
                .isInt({ min: 1, max: 365 })
                .withMessage('Delivery time must be 1-365 days'),
            
            body('revisions')
                .optional()
                .isInt({ min: 0, max: 10 })
                .withMessage('Revisions must be 0-10'),
            
            body('tags')
                .optional()
                .isArray({ max: 10 })
                .withMessage('Maximum 10 tags allowed'),
            
            body('requirements')
                .optional()
                .isArray({ max: 10 })
                .withMessage('Maximum 10 requirements allowed')
        ];
    }

    static updateService() {
        return [
            param('serviceId')
                .isMongoId()
                .withMessage('Invalid service ID'),
            
            body('title')
                .optional()
                .trim()
                .isLength({ min: 10, max: 100 })
                .withMessage('Service title must be 10-100 characters'),
            
            body('description')
                .optional()
                .trim()
                .isLength({ min: 50, max: 2000 })
                .withMessage('Description must be 50-2000 characters'),
            
            body('pricing.basePrice')
                .optional()
                .isFloat({ min: 1, max: 1000000 })
                .withMessage('Base price must be between ₹1 and ₹10,00,000')
        ];
    }

    // Booking validations
    static createBooking() {
        return [
            body('serviceId')
                .isMongoId()
                .withMessage('Valid service ID is required'),
            
            body('packageName')
                .trim()
                .isLength({ min: 1, max: 50 })
                .withMessage('Package name is required'),
            
            body('customRequirements')
                .optional()
                .trim()
                .isLength({ max: 1000 })
                .withMessage('Requirements cannot exceed 1000 characters'),
            
            body('additionalFiles')
                .optional()
                .isArray({ max: 10 })
                .withMessage('Maximum 10 additional files allowed')
        ];
    }

    static bookingMessage() {
        return [
            param('bookingId')
                .isMongoId()
                .withMessage('Invalid booking ID'),
            
            body('message')
                .trim()
                .isLength({ min: 1, max: 1000 })
                .withMessage('Message must be 1-1000 characters'),
            
            body('attachments')
                .optional()
                .isArray({ max: 5 })
                .withMessage('Maximum 5 attachments allowed')
        ];
    }

    // Review validations
    static submitReview() {
        return [
            param('bookingId')
                .isMongoId()
                .withMessage('Invalid booking ID'),
            
            body('rating')
                .isInt({ min: 1, max: 5 })
                .withMessage('Rating must be 1-5'),
            
            body('title')
                .trim()
                .isLength({ min: 5, max: 100 })
                .withMessage('Review title must be 5-100 characters'),
            
            body('comment')
                .trim()
                .isLength({ min: 10, max: 1000 })
                .withMessage('Review comment must be 10-1000 characters'),
            
            body('detailedRatings')
                .optional()
                .isObject()
                .withMessage('Detailed ratings must be an object'),
            
            body('detailedRatings.communication')
                .optional()
                .isInt({ min: 1, max: 5 })
                .withMessage('Communication rating must be 1-5'),
            
            body('detailedRatings.serviceQuality')
                .optional()
                .isInt({ min: 1, max: 5 })
                .withMessage('Service quality rating must be 1-5'),
            
            body('detailedRatings.timeliness')
                .optional()
                .isInt({ min: 1, max: 5 })
                .withMessage('Timeliness rating must be 1-5'),
            
            body('detailedRatings.value')
                .optional()
                .isInt({ min: 1, max: 5 })
                .withMessage('Value rating must be 1-5')
        ];
    }

    // Payment validations
    static createPaymentIntent() {
        return [
            body('bookingId')
                .isMongoId()
                .withMessage('Valid booking ID is required')
        ];
    }

    static confirmPayment() {
        return [
            body('paymentIntentId')
                .notEmpty()
                .withMessage('Payment intent ID is required')
                .isLength({ min: 10 })
                .withMessage('Invalid payment intent ID'),
            
            body('paymentId')
                .notEmpty()
                .withMessage('Payment ID is required')
        ];
    }

    static requestRefund() {
        return [
            param('paymentId')
                .notEmpty()
                .withMessage('Payment ID is required'),
            
            body('reason')
                .trim()
                .isLength({ min: 10, max: 500 })
                .withMessage('Refund reason must be 10-500 characters')
        ];
    }

    // Search and filter validations
    static searchServices() {
        return [
            query('query')
                .optional()
                .trim()
                .isLength({ max: 100 })
                .withMessage('Search query too long'),
            
            query('category')
                .optional()
                .isIn([
                    'web-development', 'mobile-development', 'ui-ux-design',
                    'digital-marketing', 'content-writing', 'seo',
                    'graphic-design', 'video-editing', 'photography',
                    'consulting', 'data-entry', 'virtual-assistant',
                    'accounting', 'legal', 'translation', 'tutoring'
                ])
                .withMessage('Invalid category'),
            
            query('minPrice')
                .optional()
                .isFloat({ min: 0 })
                .withMessage('Minimum price must be non-negative'),
            
            query('maxPrice')
                .optional()
                .isFloat({ min: 0 })
                .withMessage('Maximum price must be non-negative'),
            
            query('rating')
                .optional()
                .isFloat({ min: 1, max: 5 })
                .withMessage('Rating must be between 1 and 5'),
            
            query('deliveryTime')
                .optional()
                .isInt({ min: 1, max: 365 })
                .withMessage('Delivery time must be 1-365 days'),
            
            query('sortBy')
                .optional()
                .isIn(['relevance', 'price_low', 'price_high', 'rating', 'newest', 'popular'])
                .withMessage('Invalid sort option'),
            
            query('page')
                .optional()
                .isInt({ min: 1 })
                .withMessage('Page must be a positive integer'),
            
            query('limit')
                .optional()
                .isInt({ min: 1, max: 50 })
                .withMessage('Limit must be between 1 and 50')
        ];
    }

    // General validations
    static mongoId() {
        return [
            param('id')
                .isMongoId()
                .withMessage('Invalid ID format')
        ];
    }

    static pagination() {
        return [
            query('page')
                .optional()
                .isInt({ min: 1 })
                .withMessage('Page must be a positive integer'),
            
            query('limit')
                .optional()
                .isInt({ min: 1, max: 100 })
                .withMessage('Limit must be between 1 and 100')
        ];
    }

    // File upload validations
    static validateFileUpload(fieldName, allowedTypes = [], maxSize = 50 * 1024 * 1024) {
        return (req, res, next) => {
            if (!req.file && !req.files) {
                return res.status(400).json({
                    success: false,
                    message: 'No file uploaded'
                });
            }

            const files = req.files || [req.file];
            
            for (const file of files) {
                // Check file type
                if (allowedTypes.length > 0 && !allowedTypes.includes(file.mimetype)) {
                    return res.status(400).json({
                        success: false,
                        message: `File type ${file.mimetype} not allowed`
                    });
                }

                // Check file size
                if (file.size > maxSize) {
                    return res.status(400).json({
                        success: false,
                        message: `File size exceeds limit of ${maxSize / (1024 * 1024)}MB`
                    });
                }
            }

            next();
        };
    }

    // Custom validation functions
    static isStrongPassword(value) {
        const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
        return strongPasswordRegex.test(value);
    }

    static isValidIndianPhone(value) {
        const indianPhoneRegex = /^[6-9]\d{9}$/;
        return indianPhoneRegex.test(value.replace(/\D/g, ''));
    }

    static isValidUrl(value) {
        try {
            new URL(value);
            return true;
        } catch {
            return false;
        }
    }

    static sanitizeHtml(value) {
        return value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;')
            .replace(/\//g, '&#x2F;');
    }
}

module.exports = ValidationSchemas;
