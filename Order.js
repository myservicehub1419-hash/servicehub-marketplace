const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  // Customer & Provider References
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: true
  },
  providerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Provider',
    required: true
  },
  serviceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service',
    required: true
  },

  // Order Details
  title: {
    type: String,
    required: true
  },
  description: String,
  packageType: {
    type: String,
    enum: ['basic', 'standard', 'premium', 'custom'],
    required: true
  },

  // Pricing
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  platformFee: {
    type: Number,
    default: 0
  },
  netAmount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'INR'
  },

  // Order Status Flow
  status: {
    type: String,
    enum: [
      'pending',        // New order from customer
      'accepted',       // Provider accepted
      'declined',       // Provider declined
      'in_progress',    // Work in progress
      'delivered',      // Provider delivered work
      'revision_requested', // Customer requested changes
      'completed',      // Customer approved & paid
      'cancelled',      // Order cancelled
      'disputed'        // Dispute raised
    ],
    default: 'pending'
  },

  // Important Dates
  responseDeadline: {
    type: Date,
    default: function() {
      return new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours to respond
    }
  },
  deadline: Date,
  estimatedDelivery: Date,
  acceptedAt: Date,
  deliveredAt: Date,
  completedAt: Date,

  // Customer Requirements
  requirements: [{
    question: String,
    answer: String,
    type: {
      type: String,
      enum: ['text', 'file', 'multiple_choice'],
      default: 'text'
    },
    files: [String]
  }],

  // Communication
  providerMessage: String,
  customerMessage: String,
  declineReason: String,

  // Deliverables
  deliverables: [{
    filename: String,
    originalName: String,
    path: String,
    size: Number,
    uploadedAt: {
      type: Date,
      default: Date.now
    },
    description: String
  }],
  deliveryMessage: String,

  // Revisions
  revisions: [{
    requestedAt: Date,
    reason: String,
    files: [String],
    deliveredAt: Date,
    deliveryFiles: [String],
    deliveryMessage: String,
    approved: Boolean
  }],
  revisionsUsed: {
    type: Number,
    default: 0
  },
  revisionsAllowed: {
    type: Number,
    default: 1
  },

  // Payment Information
  paymentStatus: {
    type: String,
    enum: ['pending', 'held', 'released', 'refunded'],
    default: 'pending'
  },
  paymentId: String,
  razorpayOrderId: String,
  razorpayPaymentId: String,

  // Rating & Review
  customerRating: {
    type: Number,
    min: 1,
    max: 5
  },
  customerReview: String,
  providerRating: {
    type: Number,
    min: 1,
    max: 5
  },
  providerReview: String,

  // Timeline for tracking progress
  timeline: [{
    status: String,
    date: {
      type: Date,
      default: Date.now
    },
    note: String,
    user: {
      type: String,
      enum: ['customer', 'provider', 'system']
    }
  }],

  // Additional Features
  priority: {
    type: String,
    enum: ['normal', 'urgent'],
    default: 'normal'
  },
  
  // Communication Tracking
  lastMessageAt: Date,
  unreadMessagesProvider: {
    type: Number,
    default: 0
  },
  unreadMessagesCustomer: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Indexes for better query performance
orderSchema.index({ customerId: 1, status: 1 });
orderSchema.index({ providerId: 1, status: 1 });
orderSchema.index({ serviceId: 1 });
orderSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Order', orderSchema);
