const mongoose = require('mongoose');

const SubscriptionPlanSchema = new mongoose.Schema({
    // Provider information
    providerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    
    // Plan details
    planId: {
        type: String,
        enum: ['basic', 'premium', 'enterprise'],
        required: true
    },
    planName: {
        type: String,
        required: true
    },
    
    // Pricing
    amount: {
        type: Number,
        required: true
    },
    currency: {
        type: String,
        default: 'INR'
    },
    
    // Subscription period
    startDate: {
        type: Date,
        required: true,
        default: Date.now
    },
    endDate: {
        type: Date,
        required: true
    },
    duration: {
        type: Number, // days
        required: true
    },
    
    // Status
    status: {
        type: String,
        enum: ['active', 'expired', 'cancelled', 'suspended'],
        default: 'active',
        index: true
    },
    
    // Plan features and limits
    features: {
        maxServices: {
            type: Number,
            default: 3
        },
        maxImages: {
            type: Number,
            default: 5
        },
        commissionRate: {
            type: Number,
            default: 15 // percentage
        },
        prioritySupport: {
            type: Boolean,
            default: false
        },
        featuredListing: {
            type: Boolean,
            default: false
        },
        customBranding: {
            type: Boolean,
            default: false
        },
        analyticsLevel: {
            type: String,
            enum: ['basic', 'advanced', 'enterprise'],
            default: 'basic'
        }
    },
    
    // Usage tracking
    usage: {
        servicesCreated: {
            type: Number,
            default: 0
        },
        imagesUploaded: {
            type: Number,
            default: 0
        },
        lastResetDate: {
            type: Date,
            default: Date.now
        }
    },
    
    // Payment information
    payment: {
        paymentId: String,
        transactionId: String,
        paidAt: Date,
        method: String,
        gateway: String
    },
    
    // Auto-renewal
    autoRenewal: {
        enabled: {
            type: Boolean,
            default: true
        },
        paymentMethod: String,
        lastRenewalAttempt: Date,
        nextRenewalDate: Date
    },
    
    // Cancellation
    cancellation: {
        cancelledAt: Date,
        reason: String,
        cancelledBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        refundAmount: Number,
        refundedAt: Date
    },
    
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Pre-save middleware
SubscriptionPlanSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

// Virtual for checking if subscription is active
SubscriptionPlanSchema.virtual('isActive').get(function() {
    return this.status === 'active' && new Date() < this.endDate;
});

// Virtual for days remaining
SubscriptionPlanSchema.virtual('daysRemaining').get(function() {
    if (this.status !== 'active') return 0;
    const now = new Date();
    const diffTime = Math.abs(this.endDate - now);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Instance methods
SubscriptionPlanSchema.methods.canCreateService = function() {
    return this.isActive && 
           (this.features.maxServices === -1 || 
            this.usage.servicesCreated < this.features.maxServices);
};

SubscriptionPlanSchema.methods.canUploadImage = function() {
    return this.isActive && 
           (this.features.maxImages === -1 || 
            this.usage.imagesUploaded < this.features.maxImages);
};

SubscriptionPlanSchema.methods.incrementUsage = function(type, count = 1) {
    if (type === 'service') {
        this.usage.servicesCreated += count;
    } else if (type === 'image') {
        this.usage.imagesUploaded += count;
    }
    return this.save();
};

SubscriptionPlanSchema.methods.renewSubscription = function(duration = 30) {
    this.startDate = new Date();
    this.endDate = new Date(Date.now() + duration * 24 * 60 * 60 * 1000);
    this.status = 'active';
    this.autoRenewal.lastRenewalAttempt = new Date();
    this.autoRenewal.nextRenewalDate = new Date(this.endDate.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days before
    return this.save();
};

// Static methods
SubscriptionPlanSchema.statics.findActiveSubscription = function(providerId) {
    return this.findOne({
        providerId,
        status: 'active',
        endDate: { $gt: new Date() }
    });
};

SubscriptionPlanSchema.statics.findExpiringSubscriptions = function(days = 7) {
    const futureDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    return this.find({
        status: 'active',
        endDate: { $lte: futureDate, $gt: new Date() }
    }).populate('providerId', 'firstName lastName email');
};

// Indexes
SubscriptionPlanSchema.index({ providerId: 1, status: 1 });
SubscriptionPlanSchema.index({ endDate: 1, status: 1 });
SubscriptionPlanSchema.index({ 'autoRenewal.nextRenewalDate': 1, 'autoRenewal.enabled': 1 });

module.exports = mongoose.model('SubscriptionPlan', SubscriptionPlanSchema);
