const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/User');
const { generateToken, generateRefreshToken } = require('../config/auth');
const { sendEmail } = require('../services/emailService');
const { validationResult } = require('express-validator');

class AuthController {
    // Step 1-2: Register customer and send login credentials via email
    async register(req, res) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: 'Validation failed',
                    errors: errors.array()
                });
            }

            const { firstName, lastName, email, phone, userType, businessName } = req.body;

            // Check if user already exists
            const existingUser = await User.findByEmail(email);
            if (existingUser) {
                return res.status(409).json({
                    success: false,
                    message: 'User already exists with this email'
                });
            }

            // Generate temporary password for new users
            const tempPassword = this.generateTempPassword();
            
            // Create user object
            const userData = {
                firstName,
                lastName,
                email: email.toLowerCase(),
                password: tempPassword,
                phone,
                userType,
                isVerified: true // Auto-verify customers for faster onboarding
            };

            // Provider-specific setup
            if (userType === 'provider') {
                userData.providerInfo = {
                    businessName: businessName || `${firstName} ${lastName}`,
                    subscriptionPlan: null, // Will be set after plan selection
                    isApproved: false
                };
                userData.isVerified = false; // Providers need verification
            }

            const user = new User(userData);
            await user.save();

            // Send login credentials via email
            await this.sendLoginCredentials(user.email, {
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                tempPassword: tempPassword,
                userType: user.userType
            });

            res.status(201).json({
                success: true,
                message: 'Account created successfully! Login credentials have been sent to your email.',
                data: {
                    email: user.email,
                    userType: user.userType
                }
            });

        } catch (error) {
            console.error('Registration error:', error);
            res.status(500).json({
                success: false,
                message: 'Registration failed',
                error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
            });
        }
    }

    // Generate secure temporary password
    generateTempPassword() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$';
        let password = '';
        for (let i = 0; i < 10; i++) {
            password += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return password;
    }

    // Send login credentials via email
    async sendLoginCredentials(email, userData) {
        const loginUrl = `${process.env.FRONTEND_URL}/login`;
        
        await sendEmail({
            to: email,
            subject: 'Welcome to ServiceHub - Your Login Credentials',
            template: 'loginCredentials',
            data: {
                firstName: userData.firstName,
                lastName: userData.lastName,
                email: userData.email,
                tempPassword: userData.tempPassword,
                loginUrl,
                userType: userData.userType
            }
        });
    }

    // Rest of authentication methods remain the same...
    async login(req, res) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: 'Validation failed',
                    errors: errors.array()
                });
            }

            const { email, password, rememberMe } = req.body;

            const user = await User.findByEmail(email);
            if (!user) {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid email or password'
                });
            }

            const isPasswordValid = await user.comparePassword(password);
            if (!isPasswordValid) {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid email or password'
                });
            }

            if (!user.isActive) {
                return res.status(403).json({
                    success: false,
                    message: 'Account is deactivated. Please contact support.'
                });
            }

            const tokenPayload = { 
                id: user._id, 
                email: user.email, 
                userType: user.userType 
            };
            
            const accessToken = generateToken(tokenPayload);
            const refreshToken = generateRefreshToken(tokenPayload);

            user.refreshTokens.push(refreshToken);
            user.lastLogin = new Date();
            await user.save();

            const cookieOptions = {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: rememberMe ? 90 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000
            };

            res.cookie('refreshToken', refreshToken, cookieOptions);

            res.json({
                success: true,
                message: 'Login successful',
                data: {
                    user: user.getPublicProfile(),
                    accessToken,
                    expiresIn: '30d',
                    redirectTo: user.userType === 'customer' ? '/customer/dashboard' : '/provider/dashboard'
                }
            });

        } catch (error) {
            console.error('Login error:', error);
            res.status(500).json({
                success: false,
                message: 'Login failed'
            });
        }
    }
}

module.exports = new AuthController();
