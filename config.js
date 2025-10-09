// API Configuration
const API_CONFIG = {
    BASE_URL: 'http://localhost:5000', // Change to your deployed backend URL
    ENDPOINTS: {
        // Authentication
        REGISTER: '/api/auth/register',
        LOGIN: '/api/auth/login',
        LOGOUT: '/api/auth/logout',
        FORGOT_PASSWORD: '/api/auth/forgot-password',
        RESET_PASSWORD: '/api/auth/reset-password',
        REFRESH_TOKEN: '/api/auth/refresh-token',
        GET_ME: '/api/auth/me',
        UPDATE_PROFILE: '/api/auth/profile',
        CHANGE_PASSWORD: '/api/auth/change-password',
        UPLOAD_AVATAR: '/api/auth/upload-avatar',
        
        // Customer Portal
        CUSTOMER_DASHBOARD: '/api/customer/dashboard',
        SEARCH_SERVICES: '/api/customer/search',
        GET_CATEGORIES: '/api/customer/categories',
        GET_SERVICE: '/api/customer/service',
        CREATE_BOOKING: '/api/customer/booking',
        GET_BOOKINGS: '/api/customer/bookings',
        GET_BOOKING_DETAILS: '/api/customer/booking',
        SEND_MESSAGE: '/api/customer/booking/:id/message',
        REQUEST_REVISION: '/api/customer/booking/:id/revision',
        ACCEPT_DELIVERY: '/api/customer/booking/:id/accept',
        SUBMIT_REVIEW: '/api/customer/booking/:id/review',
        ADD_TO_FAVORITES: '/api/customer/favorites',
        PAYMENT_HISTORY: '/api/customer/payments',
        
        // Provider Portal
        PROVIDER_DASHBOARD: '/api/provider/dashboard',
        GET_PREMIUM_PLANS: '/api/provider/premium-plans',
        SUBSCRIBE_PLAN: '/api/provider/subscribe',
        SETUP_ACCOUNT: '/api/provider/account-setup',
        CREATE_SERVICE: '/api/provider/service',
        GET_SERVICES: '/api/provider/services',
        UPDATE_SERVICE: '/api/provider/service',
        TOGGLE_SERVICE_STATUS: '/api/provider/service/:id/status',
        GET_SERVICE_REQUESTS: '/api/provider/service-requests',
        ACCEPT_REQUEST: '/api/provider/booking/:id/accept',
        START_WORK: '/api/provider/booking/:id/start',
        DELIVER_WORK: '/api/provider/booking/:id/deliver',
        GET_PROVIDER_BOOKINGS: '/api/provider/bookings',
        GET_EARNINGS: '/api/provider/earnings',
        GET_ANALYTICS: '/api/provider/analytics',
        RESPOND_TO_REVIEW: '/api/provider/review/:id/respond',
        
        // Payment
        CREATE_PAYMENT_INTENT: '/api/payment/create-intent',
        CONFIRM_PAYMENT: '/api/payment/confirm',
        REQUEST_REFUND: '/api/payment/refund',
        GET_PAYMENT_DETAILS: '/api/payment'
    }
};

// Stripe Configuration
const STRIPE_CONFIG = {
    PUBLISHABLE_KEY: 'pk_test_your_stripe_publishable_key', // Replace with your Stripe publishable key
    CURRENCY: 'inr'
};

// App Configuration
const APP_CONFIG = {
    APP_NAME: 'ServiceHub',
    VERSION: '1.0.0',
    SUPPORTED_FILE_TYPES: {
        IMAGES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
        DOCUMENTS: ['application/pdf', '.doc', '.docx', '.txt'],
        MAX_FILE_SIZE: 50 * 1024 * 1024 // 50MB
    },
    PAGINATION: {
        DEFAULT_LIMIT: 12,
        MAX_LIMIT: 50
    }
};

// Export configurations
window.API_CONFIG = API_CONFIG;
window.STRIPE_CONFIG = STRIPE_CONFIG;
window.APP_CONFIG = APP_CONFIG;
