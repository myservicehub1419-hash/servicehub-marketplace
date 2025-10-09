const { body, param, query } = require('express-validator');

// Common validation rules
const commonValidators = {
    mongoId: (field) => param(field).isMongoId().withMessage(`Valid ${field} required`),
    
    email: (field = 'email') => body(field)
        .isEmail()
        .normalizeEmail()
        .withMessage('Please provide a valid email address'),
    
    password: (field = 'password', minLength = 6) => body(field)
        .isLength({ min: minLength })
        .withMessage(`Password must be at least ${minLength} characters long`)
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
    
    phone: (field = 'phone') => body(field)
        .isMobilePhone('en-IN')
        .withMessage('Please provide a valid Indian phone number'),
    
    name: (field = 'name', minLength = 2, maxLength = 50) => body(field)
        .trim()
        .isLength({ min: minLength, max: maxLength })
        .withMessage(`${field} must be ${minLength}-${maxLength} characters long`)
        .matches(/^[a-zA-Z\s]+$/)
        .withMessage(`${field} can only contain letters and spaces`),
    
    rating: (field = 'rating') => body(field)
        .isFloat({ min: 1, max: 5 })
        .withMessage('Rating must be between 1 and 5'),
    
    coordinates: (latField = 'lat', lngField = 'lng') => [
        body(latField)
            .isFloat({ min: -90, max: 90 })
            .withMessage('Latitude must be between -90 and 90'),
        body(lngField)
            .isFloat({ min: -180, max: 180 })
            .withMessage('Longitude must be between -180 and 180')
    ],
    
    pagination: () => [
        query('page')
            .optional()
            .isInt({ min: 1 })
            .withMessage('Page must be a positive integer'),
        query('limit')
            .optional()
            .isInt({ min: 1, max: 100 })
            .withMessage('Limit must be between 1 and 100')
    ]
};

// User validation rules
const userValidators = {
    register: [
        commonValidators.name('name'),
        commonValidators.email(),
        commonValidators.phone(),
        commonValidators.password(),
        body('role')
            .isIn(['customer', 'provider'])
            .withMessage('Role must be either customer or provider'),
        body('location.city')
            .optional()
            .trim()
            .isLength({ min: 2, max: 50 })
            .withMessage('City must be 2-50 characters long'),
        body('location.state')
            .optional()
            .trim()
            .isLength({ min: 2, max: 50 })
            .withMessage('State must be 2-50 characters long')
    ],
    
    login: [
        commonValidators.email(),
        body('password')
            .notEmpty()
            .withMessage('Password is required')
    ],
    
    updateProfile: [
        commonValidators.name('name').optional(),
        commonValidators.phone().optional(),
        body('bio')
            .optional()
            .trim()
            .isLength({ max: 500 })
            .withMessage('Bio cannot exceed 500 characters')
    ],
    
    changePassword: [
        body('currentPassword')
            .notEmpty()
            .withMessage('Current password is required'),
        commonValidators.password('newPassword')
    ]
};

// Service validation rules
const serviceValidators = {
    create: [
        body('title')
            .trim()
            .isLength({ min: 5, max: 100 })
            .withMessage('Title must be 5-100 characters long'),
        body('description')
            .trim()
            .isLength({ min: 20, max: 2000 })
            .withMessage('Description must be 20-2000 characters long'),
        body('category')
            .isIn(['home_services', 'beauty_wellness', 'repairs_maintenance', 'education_training', 'events_entertainment', 'health_fitness', 'business_services', 'automotive', 'technology', 'other'])
            .withMessage('Invalid service category'),
        body('subcategory')
            .trim()
            .notEmpty()
            .withMessage('Subcategory is required'),
        body('pricing.amount')
            .isFloat({ min: 1 })
            .withMessage('Price must be greater than 0'),
        body('pricing.type')
            .isIn(['fixed', 'hourly', 'package'])
            .withMessage('Invalid pricing type'),
        body('location.city')
            .trim()
            .notEmpty()
            .withMessage('City is required'),
        body('location.state')
            .trim()
            .notEmpty()
            .withMessage('State is required')
    ],
    
    search: [
        query('q')
            .optional()
            .trim()
            .isLength({ max: 200 })
            .withMessage('Search query too long'),
        query('category')
            .optional()
            .isIn(['home_services', 'beauty_wellness', 'repairs_maintenance', 'education_training', 'events_entertainment', 'health_fitness', 'business_services', 'automotive', 'technology', 'other']),
        query('minPrice')
            .optional()
            .isFloat({ min: 0 })
            .withMessage('Invalid minimum price'),
        query('maxPrice')
            .optional()
            .isFloat({ min: 0 })
            .withMessage('Invalid maximum price'),
        query('rating')
            .optional()
            .isFloat({ min: 0, max: 5 })
            .withMessage('Rating must be between 0-5'),
        query('sortBy')
            .optional()
            .isIn(['relevance', 'price_low', 'price_high', 'rating', 'newest', 'distance']),
        ...commonValidators.pagination()
    ]
};

// Booking validation rules
const bookingValidators = {
    create: [
        body('serviceId')
            .isMongoId()
            .withMessage('Valid service ID required'),
        body('providerId')
            .isMongoId()
            .withMessage('Valid provider ID required'),
        body('requestedDate')
            .isISO8601()
            .withMessage('Valid date required')
            .custom(value => {
                const date = new Date(value);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                
                if (date < today) {
                    throw new Error('Date cannot be in the past');
                }
                return true;
            }),
        body('requestedTime')
            .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
            .withMessage('Valid time format required (HH:MM)'),
        body('location.type')
            .isIn(['customer_location', 'provider_location', 'online', 'custom'])
            .withMessage('Valid location type required'),
        body('specialRequests')
            .optional()
            .trim()
            .isLength({ max: 500 })
            .withMessage('Special requests cannot exceed 500 characters'),
        body('estimatedDuration')
            .optional()
            .isInt({ min: 15, max: 480 })
            .withMessage('Duration must be between 15-480 minutes')
    ],
    
    updateStatus: [
        commonValidators.mongoId('bookingId'),
        body('status')
            .isIn(['confirmed', 'in_progress', 'completed', 'cancelled'])
            .withMessage('Invalid status'),
        body('note')
            .optional()
            .trim()
            .isLength({ max: 500 })
            .withMessage('Note cannot exceed 500 characters')
    ],
    
    cancel: [
        commonValidators.mongoId('bookingId'),
        body('reason')
            .trim()
            .notEmpty()
            .isLength({ max: 500 })
            .withMessage('Cancellation reason required (max 500 characters)')
    ],
    
    reschedule: [
        commonValidators.mongoId('bookingId'),
        body('newDate')
            .isISO8601()
            .withMessage('Valid new date required'),
        body('newTime')
            .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
            .withMessage('Valid time format required'),
        body('reason')
            .optional()
            .trim()
            .isLength({ max: 500 })
            .withMessage('Reason cannot exceed 500 characters')
    ]
};

// Review validation rules
const reviewValidators = {
    submit: [
        body('bookingId')
            .isMongoId()
            .withMessage('Valid booking ID required'),
        body('ratings.overall')
            .isFloat({ min: 1, max: 5 })
            .withMessage('Overall rating must be 1-5'),
        body('ratings.quality')
            .optional()
            .isFloat({ min: 1, max: 5 })
            .withMessage('Quality rating must be 1-5'),
        body('ratings.communication')
            .optional()
            .isFloat({ min: 1, max: 5 })
            .withMessage('Communication rating must be 1-5'),
        body('ratings.timeliness')
            .optional()
            .isFloat({ min: 1, max: 5 })
            .withMessage('Timeliness rating must be 1-5'),
        body('ratings.professionalism')
            .optional()
            .isFloat({ min: 1, max: 5 })
            .withMessage('Professionalism rating must be 1-5'),
        body('ratings.value')
            .optional()
            .isFloat({ min: 1, max: 5 })
            .withMessage('Value rating must be 1-5'),
        body('review.comment')
            .trim()
            .isLength({ min: 10, max: 1000 })
            .withMessage('Review must be 10-1000 characters'),
        body('review.title')
            .optional()
            .trim()
            .isLength({ max: 100 })
            .withMessage('Title cannot exceed 100 characters'),
        body('reviewType')
            .isIn(['customer_to_provider', 'provider_to_customer'])
            .withMessage('Invalid review type')
    ],
    
    addResponse: [
        commonValidators.mongoId('reviewId'),
        body('responseText')
            .trim()
            .isLength({ min: 10, max: 500 })
            .withMessage('Response must be 10-500 characters')
    ],
    
    vote: [
        commonValidators.mongoId('reviewId'),
        body('isHelpful')
            .isBoolean()
            .withMessage('Vote must be true (helpful) or false (not helpful)')
    ],
    
    report: [
        commonValidators.mongoId('reviewId'),
        body('reason')
            .isIn(['spam', 'inappropriate', 'fake', 'harassment', 'other'])
            .withMessage('Invalid report reason'),
        body('details')
            .optional()
            .trim()
            .isLength({ max: 500 })
            .withMessage('Details cannot exceed 500 characters')
    ]
};

// Message validation rules
const messageValidators = {
    send: [
        body('bookingId')
            .isMongoId()
            .withMessage('Valid booking ID required'),
        body('receiverId')
            .isMongoId()
            .withMessage('Valid receiver ID required'),
        body('messageType')
            .isIn(['text', 'image', 'file', 'audio', 'video', 'location'])
            .withMessage('Invalid message type'),
        body('content.text')
            .optional()
            .trim()
            .isLength({ min: 1, max: 2000 })
            .withMessage('Message content must be 1-2000 characters'),
        body('priority')
            .optional()
            .isIn(['low', 'normal', 'high', 'urgent'])
    ],
    
    edit: [
        commonValidators.mongoId('messageId'),
        body('content')
            .trim()
            .isLength({ min: 1, max: 2000 })
            .withMessage('Content must be 1-2000 characters')
    ],
    
    reaction: [
        commonValidators.mongoId('messageId'),
        body('emoji')
            .trim()
            .isLength({ min: 1, max: 10 })
            .withMessage('Invalid emoji')
    ]
};

// Payment validation rules
const paymentValidators = {
    createOrder: [
        body('bookingId')
            .isMongoId()
            .withMessage('Valid booking ID required'),
        body('paymentMethod')
            .optional()
            .isIn(['razorpay', 'wallet'])
            .withMessage('Invalid payment method')
    ],
    
    verifyPayment: [
        body('razorpay_order_id')
            .notEmpty()
            .withMessage('Razorpay order ID required'),
        body('razorpay_payment_id')
            .notEmpty()
            .withMessage('Razorpay payment ID required'),
        body('razorpay_signature')
            .notEmpty()
            .withMessage('Razorpay signature required'),
        body('bookingId')
            .isMongoId()
            .withMessage('Valid booking ID required')
    ],
    
    refund: [
        body('bookingId')
            .isMongoId()
            .withMessage('Valid booking ID required'),
        body('amount')
            .optional()
            .isFloat({ min: 1 })
            .withMessage('Refund amount must be positive'),
        body('reason')
            .trim()
            .notEmpty()
            .isLength({ max: 500 })
            .withMessage('Refund reason required (max 500 characters)')
    ]
};

module.exports = {
    commonValidators,
    userValidators,
    serviceValidators,
    bookingValidators,
    reviewValidators,
    messageValidators,
    paymentValidators
};
