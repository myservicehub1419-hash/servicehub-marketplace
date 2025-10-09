const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const validator = require('validator');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Name is required'],
        trim: true,
        minlength: [2, 'Name must be at least 2 characters'],
        maxlength: [50, 'Name cannot exceed 50 characters']
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        lowercase: true,
        validate: [validator.isEmail, 'Please provide a valid email']
    },
    phone: {
        type: String,
        required: [true, 'Phone number is required'],
        validate: {
            validator: function(v) {
                return /^\+?[\d\s-()]{10,}$/.test(v);
            },
            message: 'Please provide a valid phone number'
        }
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: [6, 'Password must be at least 6 characters']
    },
    role: {
        type: String,
        enum: ['customer', 'provider', 'admin'],
        required: true,
        default: 'customer'
    },
    profileImage: {
        type: String,
        default: null
    },
    bio: {
        type: String,
        maxlength: [500, 'Bio cannot exceed 500 characters']
    },
    location: {
        type: {
            type: String,
            enum: ['Point'],
            default: 'Point'
        },
        coordinates: {
            type: [Number],
            index: '2dsphere'
        },
        address: String,
        city: String,
        state: String,
        country: String,
        zipCode: String
    },
    isVerified: {
        type: Boolean,
        default: false
    },
    isActive: {
        type: Boolean,
        default: true
    },
    verification: {
        email: {
            isVerified: { type: Boolean, default: false },
            token: String,
            expiresAt: Date
        },
        phone: {
            isVerified: { type: Boolean, default: false },
            otp: String,
            expiresAt: Date
        },
        identity: {
            status: {
                type: String,
                enum: ['pending', 'verified', 'rejected'],
                default: 'pending'
            },
            documentType: String,
            documentNumber: String,
            documentUrl: String,
            verifiedAt: Date,
            rejectionReason: String
        },
        background: {
            status: {
                type: String,
                enum: ['pending', 'verified', 'rejected'],
                default: 'pending'
            },
            verifiedAt: Date
        }
    },
    rating: {
        average: { type: Number, default: 0, min: 0, max: 5 },
        count: { type: Number, default: 0 }
    },
    earnings: {
        total: { type: Number, default: 0 },
        pending: { type: Number, default: 0 },
        withdrawn: { type: Number, default: 0 }
    },
    subscription: {
        plan: {
            type: String,
            enum: ['free', 'basic', 'premium', 'enterprise'],
            default: 'free'
        },
        startDate: Date,
        endDate: Date,
        isActive: { type: Boolean, default: false }
    },
    fcmTokens: [String], // Support multiple devices
    preferences: {
        notifications: {
            email: { type: Boolean, default: true },
            sms: { type: Boolean, default: true },
            push: { type: Boolean, default: true }
        },
        language: { type: String, default: 'en' },
        currency: { type: String, default: 'INR' },
        timezone: { type: String, default: 'Asia/Kolkata' }
    },
    socialProfiles: {
        linkedin: String,
        facebook: String,
        instagram: String,
        website: String
    },
    bankDetails: {
        accountNumber: String,
        ifscCode: String,
        accountHolderName: String,
        bankName: String,
        isVerified: { type: Boolean, default: false }
    },
    lastActive: { type: Date, default: Date.now },
    loginAttempts: { type: Number, default: 0 },
    lockUntil: Date
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Indexes
userSchema.index({ email: 1 });
userSchema.index({ phone: 1 });
userSchema.index({ role: 1 });
userSchema.index({ 'location.coordinates': '2dsphere' });
userSchema.index({ isActive: 1, isVerified: 1 });

// Virtual for full name
userSchema.virtual('fullName').get(function() {
    return this.name;
});

// Hash password before saving
userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    
    try {
        const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 10;
        this.password = await bcrypt.hash(this.password, saltRounds);
        next();
    } catch (error) {
        next(error);
    }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
    try {
        return await bcrypt.compare(candidatePassword, this.password);
    } catch (error) {
        throw error;
    }
};

// Check if account is locked
userSchema.methods.isLocked = function() {
    return !!(this.lockUntil && this.lockUntil > Date.now());
};

// Increment login attempts
userSchema.methods.incrementLoginAttempts = function() {
    const maxAttempts = 5;
    const lockTime = 2 * 60 * 60 * 1000; // 2 hours

    if (this.lockUntil && this.lockUntil < Date.now()) {
        return this.updateOne({
            $unset: { lockUntil: 1 },
            $set: { loginAttempts: 1 }
        });
    }

    const updates = { $inc: { loginAttempts: 1 } };
    
    if (this.loginAttempts + 1 >= maxAttempts && !this.isLocked()) {
        updates.$set = { lockUntil: Date.now() + lockTime };
    }
    
    return this.updateOne(updates);
};

// Reset login attempts
userSchema.methods.resetLoginAttempts = function() {
    return this.updateOne({
        $unset: { loginAttempts: 1, lockUntil: 1 }
    });
};

// Update last active
userSchema.methods.updateLastActive = function() {
    this.lastActive = new Date();
    return this.save();
};

module.exports = mongoose.model('User', userSchema);
