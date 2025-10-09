const crypto = require('crypto');
const path = require('path');
const fs = require('fs').promises;

class Helpers {
    // Generate unique IDs
    static generateId(prefix = '', length = 8) {
        const timestamp = Date.now().toString().slice(-6);
        const random = Math.random().toString(36).substr(2, length - 6);
        return prefix ? `${prefix}_${timestamp}${random}`.toUpperCase() : `${timestamp}${random}`.toUpperCase();
    }

    // Generate secure tokens
    static generateSecureToken(bytes = 32) {
        return crypto.randomBytes(bytes).toString('hex');
    }

    // Hash strings with salt
    static async hashString(input, salt = null) {
        const saltToUse = salt || crypto.randomBytes(16).toString('hex');
        const hash = crypto.createHash('sha256');
        hash.update(input + saltToUse);
        return {
            hash: hash.digest('hex'),
            salt: saltToUse
        };
    }

    // Verify hashed strings
    static async verifyHash(input, hashedValue, salt) {
        const { hash } = await this.hashString(input, salt);
        return hash === hashedValue;
    }

    // Sanitize filename for uploads
    static sanitizeFilename(filename) {
        // Remove path components and dangerous characters
        const basename = path.basename(filename);
        return basename.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 100);
    }

    // Generate SEO-friendly slugs
    static generateSlug(text, maxLength = 60) {
        return text
            .toLowerCase()
            .trim()
            .replace(/[^\w\s-]/g, '') // Remove special characters
            .replace(/[\s_-]+/g, '-') // Replace spaces and underscores with hyphens
            .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
            .substring(0, maxLength);
    }

    // Format currency
    static formatCurrency(amount, currency = 'INR', locale = 'en-IN') {
        return new Intl.NumberFormat(locale, {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(amount);
    }

    // Format dates
    static formatDate(date, options = {}) {
        const defaultOptions = {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            timeZone: 'Asia/Kolkata'
        };
        
        const formatOptions = { ...defaultOptions, ...options };
        return new Intl.DateTimeFormat('en-IN', formatOptions).format(new Date(date));
    }

    // Calculate time difference
    static getTimeAgo(date) {
        const now = new Date();
        const diffTime = Math.abs(now - new Date(date));
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
        const diffMinutes = Math.floor(diffTime / (1000 * 60));

        if (diffDays > 0) {
            return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
        } else if (diffHours > 0) {
            return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
        } else if (diffMinutes > 0) {
            return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
        } else {
            return 'Just now';
        }
    }

    // Paginate results
    static paginate(page = 1, limit = 10, total = 0) {
        const currentPage = Math.max(1, parseInt(page));
        const itemsPerPage = Math.max(1, Math.min(100, parseInt(limit)));
        const totalPages = Math.ceil(total / itemsPerPage);
        const offset = (currentPage - 1) * itemsPerPage;

        return {
            page: currentPage,
            limit: itemsPerPage,
            total,
            totalPages,
            offset,
            hasNext: currentPage < totalPages,
            hasPrev: currentPage > 1
        };
    }

    // Validate email format
    static isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    // Validate Indian phone number
    static isValidIndianPhone(phone) {
        const phoneRegex = /^[6-9]\d{9}$/;
        return phoneRegex.test(phone.replace(/\D/g, ''));
    }

    // Clean and validate URLs
    static validateUrl(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
        } catch {
            return false;
        }
    }

    // Generate OTP
    static generateOTP(length = 6) {
        const digits = '0123456789';
        let otp = '';
        for (let i = 0; i < length; i++) {
            otp += digits[Math.floor(Math.random() * 10)];
        }
        return otp;
    }

    // Mask sensitive data
    static maskEmail(email) {
        const [username, domain] = email.split('@');
        const maskedUsername = username.charAt(0) + '*'.repeat(username.length - 2) + username.slice(-1);
        return `${maskedUsername}@${domain}`;
    }

    static maskPhone(phone) {
        const cleanPhone = phone.replace(/\D/g, '');
        if (cleanPhone.length === 10) {
            return `${cleanPhone.slice(0, 2)}****${cleanPhone.slice(-2)}`;
        }
        return '****';
    }

    // File operations
    static async ensureDirectoryExists(dirPath) {
        try {
            await fs.access(dirPath);
        } catch {
            await fs.mkdir(dirPath, { recursive: true });
        }
    }

    static async deleteFile(filePath) {
        try {
            await fs.unlink(filePath);
            return true;
        } catch (error) {
            console.error('Delete file error:', error);
            return false;
        }
    }

    static getFileExtension(filename) {
        return path.extname(filename).toLowerCase().substring(1);
    }

    static isImageFile(filename) {
        const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];
        return imageExtensions.includes(this.getFileExtension(filename));
    }

    static isVideoFile(filename) {
        const videoExtensions = ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm'];
        return videoExtensions.includes(this.getFileExtension(filename));
    }

    static isDocumentFile(filename) {
        const docExtensions = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt'];
        return docExtensions.includes(this.getFileExtension(filename));
    }

    // String utilities
    static truncateText(text, maxLength = 100, suffix = '...') {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength - suffix.length) + suffix;
    }

    static capitalizeFirst(str) {
        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    }

    static capitalizeWords(str) {
        return str.replace(/\w\S*/g, (txt) => 
            txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
        );
    }

    // Array utilities
    static chunkArray(array, chunkSize) {
        const chunks = [];
        for (let i = 0; i < array.length; i += chunkSize) {
            chunks.push(array.slice(i, i + chunkSize));
        }
        return chunks;
    }

    static removeDuplicates(array) {
        return [...new Set(array)];
    }

    static shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    // Object utilities
    static deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    static omitFields(obj, fieldsToOmit) {
        const result = { ...obj };
        fieldsToOmit.forEach(field => delete result[field]);
        return result;
    }

    static pickFields(obj, fieldsToPick) {
        const result = {};
        fieldsToPick.forEach(field => {
            if (obj.hasOwnProperty(field)) {
                result[field] = obj[field];
            }
        });
        return result;
    }

    // Rate limiting utilities
    static createRateLimitKey(identifier, action) {
        return `rate_limit:${action}:${identifier}`;
    }

    // Search utilities
    static createSearchRegex(query, options = { caseSensitive: false }) {
        const flags = options.caseSensitive ? 'g' : 'gi';
        const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(escapedQuery, flags);
    }

    // Commission calculations
    static calculateCommission(amount, rate) {
        const commission = (amount * rate) / 100;
        const providerAmount = amount - commission;
        return {
            totalAmount: amount,
            commissionRate: rate,
            commissionAmount: parseFloat(commission.toFixed(2)),
            providerAmount: parseFloat(providerAmount.toFixed(2))
        };
    }

    // Distance calculations (for location-based services)
    static calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Radius of the Earth in km
        const dLat = this.degToRad(lat2 - lat1);
        const dLon = this.degToRad(lon2 - lon1);
        const a = 
            Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(this.degToRad(lat1)) * Math.cos(this.degToRad(lat2)) * 
            Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c; // Distance in km
    }

    static degToRad(deg) {
        return deg * (Math.PI/180);
    }

    // Analytics utilities
    static generateDateRange(startDate, endDate) {
        const dates = [];
        const current = new Date(startDate);
        const end = new Date(endDate);

        while (current <= end) {
            dates.push(new Date(current));
            current.setDate(current.getDate() + 1);
        }

        return dates;
    }

    // Error handling utilities
    static createError(message, statusCode = 500, code = null) {
        const error = new Error(message);
        error.statusCode = statusCode;
        error.code = code;
        return error;
    }

    // Response formatting utilities
    static formatResponse(success, message, data = null, errors = null) {
        const response = { success, message };
        if (data !== null) response.data = data;
        if (errors !== null) response.errors = errors;
        return response;
    }

    static formatSuccessResponse(message, data = null) {
        return this.formatResponse(true, message, data);
    }

    static formatErrorResponse(message, errors = null) {
        return this.formatResponse(false, message, null, errors);
    }
}

module.exports = Helpers;
