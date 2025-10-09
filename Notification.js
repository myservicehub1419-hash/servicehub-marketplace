const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
    // User who will receive the notification
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    
    // Notification content
    title: {
        type: String,
        required: true,
        maxlength: 100
    },
    message: {
        type: String,
        required: true,
        maxlength: 500
    },
    
    // Notification type
    type: {
        type: String,
        enum: [
            'booking_accepted',
            'job_completed',
            'new_order',
            'payment_received',
            'message_received',
            'profile_approved',
            'subscription_expiring',
            'review_received',
            'system'
        ],
        required: true,
        index: true
    },
    
    // Additional data
    data: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    
    // Read status
    read: {
        type: Boolean,
        default: false,
        index: true
    },
    readAt: {
        type: Date
    },
    
    // Delivery channels
    channels: {
        email: {
            sent: { type: Boolean, default: false },
            sentAt: Date,
            messageId: String
        },
        whatsapp: {
            sent: { type: Boolean, default: false },
            sentAt: Date,
            messageId: String
        },
        web: {
            sent: { type: Boolean, default: false },
            sentAt: Date
        },
        push: {
            sent: { type: Boolean, default: false },
            sentAt: Date
        }
    },
    
    // Priority level
    priority: {
        type: String,
        enum: ['low', 'normal', 'high', 'urgent'],
        default: 'normal'
    },
    
    // Expiration
    expiresAt: {
        type: Date,
        index: { expireAfterSeconds: 0 }
    },
    
    createdAt: {
        type: Date,
        default: Date.now,
        index: true
    }
});

// Compound indexes for efficient queries
NotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, type: 1, createdAt: -1 });

// Static methods
NotificationSchema.statics.getUnreadCount = function(userId) {
    return this.countDocuments({ userId, read: false });
};

NotificationSchema.statics.markAllAsRead = function(userId) {
    return this.updateMany(
        { userId, read: false },
        { read: true, readAt: new Date() }
    );
};

module.exports = mongoose.model('Notification', NotificationSchema);
