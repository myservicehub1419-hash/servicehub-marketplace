const nodemailer = require('nodemailer');

class EmailService {
    constructor() {
        this.transporter = null;
        this.templates = new Map();
        this.init();
    }

    async init() {
        this.transporter = nodemailer.createTransporter({
            service: process.env.EMAIL_SERVICE || 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            },
            secure: true,
            logger: process.env.NODE_ENV === 'development',
            debug: process.env.NODE_ENV === 'development'
        });

        try {
            await this.transporter.verify();
            console.log('✅ Email service ready');
        } catch (error) {
            console.error('❌ Email service configuration error:', error.message);
        }

        await this.loadTemplates();
    }

    async loadTemplates() {
        const templates = {
            // Customer workflow templates
            loginCredentials: {
                subject: 'Welcome to ServiceHub - Your Login Credentials',
                html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <title>Login Credentials</title>
                    <style>
                        .container { max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif; }
                        .header { background: #2563eb; color: white; padding: 20px; text-align: center; }
                        .content { padding: 30px; background: #f9fafb; }
                        .credentials { background: #e0f2fe; padding: 20px; border-radius: 8px; margin: 20px 0; }
                        .button { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
                        .footer { padding: 20px; text-align: center; color: #6b7280; font-size: 14px; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>Welcome to ServiceHub! 🎉</h1>
                        </div>
                        <div class="content">
                            <h2>Hello {{firstName}} {{lastName}},</h2>
                            <p>Your ServiceHub account has been created successfully! Here are your login credentials:</p>
                            
                            <div class="credentials">
                                <h3>Your Login Details</h3>
                                <p><strong>Email:</strong> {{email}}</p>
                                <p><strong>Temporary Password:</strong> {{tempPassword}}</p>
                                <p><strong>Account Type:</strong> {{userType}}</p>
                            </div>
                            
                            <p><strong>⚠️ Important:</strong> Please change your password after first login for security.</p>
                            
                            <a href="{{loginUrl}}" class="button">Login to Your Account</a>
                            
                            <p>If you have any questions, feel free to contact our support team.</p>
                        </div>
                        <div class="footer">
                            <p>&copy; 2025 ServiceHub. All rights reserved.</p>
                        </div>
                    </div>
                </body>
                </html>
                `
            },
            
            newBookingRequest: {
                subject: 'New Service Request - ServiceHub',
                html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <title>New Service Request</title>
                    <style>
                        .container { max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif; }
                        .header { background: #10b981; color: white; padding: 20px; text-align: center; }
                        .content { padding: 30px; background: #f9fafb; }
                        .request-details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981; }
                        .button { display: inline-block; background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
                        .amount { font-size: 24px; color: #10b981; font-weight: bold; }
                        .footer { padding: 20px; text-align: center; color: #6b7280; font-size: 14px; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>🎯 New Service Request!</h1>
                        </div>
                        <div class="content">
                            <h2>Hello {{providerName}},</h2>
                            <p>You have received a new service request. A customer has already made the initial payment!</p>
                            
                            <div class="request-details">
                                <h3>Project Details</h3>
                                <p><strong>Project:</strong> {{projectTitle}}</p>
                                <p><strong>Customer:</strong> {{customerName}}</p>
                                <p><strong>Phone:</strong> {{customerPhone}}</p>
                                <p><strong>Service:</strong> {{serviceTitle}}</p>
                                <p><strong>Package:</strong> {{packageName}}</p>
                                <p><strong>Description:</strong></p>
                                <p>{{projectDescription}}</p>
                                
                                {{#if requirements}}
                                <p><strong>Requirements:</strong></p>
                                <p>{{requirements}}</p>
                                {{/if}}
                                
                                <p><strong>Total Amount:</strong> <span class="amount">₹{{totalAmount}}</span></p>
                                <p><strong>Your Earnings:</strong> <span class="amount">₹{{providerEarnings}}</span></p>
                                <p><strong>Booking ID:</strong> {{bookingId}}</p>
                                
                                {{#if deadline}}
                                <p><strong>Deadline:</strong> {{deadline}}</p>
                                {{/if}}
                            </div>
                            
                            <p>The customer has already paid 50% of the amount. Please review and accept this request to start working.</p>
                            
                            <a href="{{dashboardUrl}}" class="button">Review & Accept Request</a>
                            
                            <p><strong>⏰ Action Required:</strong> Please respond within 24 hours to maintain your response rate.</p>
                        </div>
                        <div class="footer">
                            <p>&copy; 2025 ServiceHub. All rights reserved.</p>
                        </div>
                    </div>
                </body>
                </html>
                `
            },
            
            serviceAccepted: {
                subject: 'Service Provider Accepted Your Request - ServiceHub',
                html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <title>Service Request Accepted</title>
                    <style>
                        .container { max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif; }
                        .header { background: #10b981; color: white; padding: 20px; text-align: center; }
                        .content { padding: 30px; background: #f9fafb; }
                        .success-box { background: #d1fae5; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #10b981; }
                        .button { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
                        .footer { padding: 20px; text-align: center; color: #6b7280; font-size: 14px; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>🎉 Request Accepted!</h1>
                        </div>
                        <div class="content">
                            <h2>Great news, {{customerName}}!</h2>
                            
                            <div class="success-box">
                                <h3>✅ Your service request has been accepted!</h3>
                                <p><strong>Project:</strong> {{projectTitle}}</p>
                                <p><strong>Service:</strong> {{serviceTitle}}</p>
                                <p><strong>Provider:</strong> {{providerName}}</p>
                                <p><strong>Booking ID:</strong> {{bookingId}}</p>
                                {{#if expectedDelivery}}
                                <p><strong>Expected Delivery:</strong> {{expectedDelivery}}</p>
                                {{/if}}
                            </div>
                            
                            <p>The service provider has accepted your request and will start working on your project soon. You can track the progress and communicate with your provider through your dashboard.</p>
                            
                            <a href="{{chatUrl}}" class="button">Chat with Provider</a>
                            
                            <p><strong>What's Next?</strong></p>
                            <ul>
                                <li>Your provider will start working on your project</li>
                                <li>You'll receive updates on progress</li>
                                <li>You can communicate via our messaging system</li>
                                <li>Final payment will be required upon completion</li>
                            </ul>
                        </div>
                        <div class="footer">
                            <p>&copy; 2025 ServiceHub. All rights reserved.</p>
                        </div>
                    </div>
                </body>
                </html>
                `
            },
            
            jobCompleted: {
                subject: 'Your Project is Complete - Final Payment Required',
                html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <title>Project Completed</title>
                    <style>
                        .container { max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif; }
                        .header { background: #f59e0b; color: white; padding: 20px; text-align: center; }
                        .content { padding: 30px; background: #f9fafb; }
                        .completion-box { background: #fef3c7; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #f59e0b; }
                        .payment-box { background: #dbeafe; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #2563eb; }
                        .button { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
                        .amount { font-size: 20px; color: #2563eb; font-weight: bold; }
                        .footer { padding: 20px; text-align: center; color: #6b7280; font-size: 14px; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>🎊 Project Completed!</h1>
                        </div>
                        <div class="content">
                            <h2>Congratulations, {{customerName}}!</h2>
                            
                            <div class="completion-box">
                                <h3>✅ Your project is complete!</h3>
                                <p><strong>Project:</strong> {{projectTitle}}</p>
                                <p><strong>Booking ID:</strong> {{bookingId}}</p>
                                {{#if completionMessage}}
                                <p><strong>Provider Message:</strong></p>
                                <p style="font-style: italic;">"{{completionMessage}}"</p>
                                {{/if}}
                            </div>
                            
                            <div class="payment-box">
                                <h3>💳 Final Payment Required</h3>
                                <p>To receive your completed deliverables, please complete the final payment:</p>
                                <p><strong>Remaining Amount:</strong> <span class="amount">₹{{remainingAmount}}</span></p>
                            </div>
                            
                            <a href="{{paymentUrl}}" class="button">Complete Final Payment</a>
                            
                            <p><strong>What happens after payment?</strong></p>
                            <ul>
                                <li>Immediate access to all deliverables</li>
                                <li>Project completion confirmation</li>
                                <li>Option to leave a review</li>
                                <li>Download all project files</li>
                            </ul>
                            
                            <p>Thank you for choosing ServiceHub! We hope you're satisfied with the completed work.</p>
                        </div>
                        <div class="footer">
                            <p>&copy; 2025 ServiceHub. All rights reserved.</p>
                        </div>
                    </div>
                </body>
                </html>
                `
            },

            // Provider workflow templates
            subscriptionActivated: {
                subject: 'Subscription Activated - Welcome to ServiceHub Premium',
                html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <title>Subscription Activated</title>
                    <style>
                        .container { max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif; }
                        .header { background: #10b981; color: white; padding: 20px; text-align: center; }
                        .content { padding: 30px; background: #f9fafb; }
                        .plan-box { background: #d1fae5; padding: 20px; border-radius: 8px; margin: 20px 0; }
                        .feature-list { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
                        .button { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
                        .footer { padding: 20px; text-align: center; color: #6b7280; font-size: 14px; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>🚀 Welcome to Premium!</h1>
                        </div>
                        <div class="content">
                            <h2>Hello {{providerName}},</h2>
                            
                            <div class="plan-box">
                                <h3>✅ Your {{planName}} subscription is now active!</h3>
                                <p><strong>Plan:</strong> {{planName}}</p>
                                <p><strong>Valid Until:</strong> {{endDate}}</p>
                                <p><strong>Commission Rate:</strong> {{commissionRate}}%</p>
                            </div>
                            
                            <p>Congratulations! You now have access to premium features that will help you grow your business on ServiceHub.</p>
                            
                            <div class="feature-list">
                                <h3>🎯 Your Premium Features:</h3>
                                <ul>
                                    {{#each features}}
                                    <li>{{this}}</li>
                                    {{/each}}
                                </ul>
                            </div>
                            
                            <a href="{{dashboardUrl}}" class="button">Go to Dashboard</a>
                            
                            <p><strong>Next Steps:</strong></p>
                            <ul>
                                <li>Complete your profile setup</li>
                                <li>Create your first service listing</li>
                                <li>Upload your portfolio</li>
                                <li>Start receiving orders!</li>
                            </ul>
                        </div>
                        <div class="footer">
                            <p>&copy; 2025 ServiceHub. All rights reserved.</p>
                        </div>
                    </div>
                </body>
                </html>
                `
            }
        };

        this.templates = new Map(Object.entries(templates));
        console.log('✅ Email templates loaded');
    }

    async sendEmail({ to, subject, template, data = {}, attachments = [] }) {
        try {
            if (!this.transporter) {
                throw new Error('Email service not initialized');
            }

            let html = '';
            let emailSubject = subject;

            if (template && this.templates.has(template)) {
                const templateData = this.templates.get(template);
                html = this.replaceTemplateVariables(templateData.html, data);
                emailSubject = templateData.subject;
            }

            const mailOptions = {
                from: {
                    name: 'ServiceHub',
                    address: process.env.EMAIL_USER
                },
                to,
                subject: emailSubject,
                html,
                attachments
            };

            const result = await this.transporter.sendMail(mailOptions);
            console.log(`✅ Email sent to ${to}: ${emailSubject}`);
            return { success: true, messageId: result.messageId };

        } catch (error) {
            console.error(`❌ Email send failed to ${to}:`, error.message);
            return { success: false, error: error.message };
        }
    }

    replaceTemplateVariables(template, data) {
        let result = template;
        
        // Replace simple variables
        for (const [key, value] of Object.entries(data)) {
            const regex = new RegExp(`{{${key}}}`, 'g');
            result = result.replace(regex, value || '');
        }

        // Handle conditional blocks (basic implementation)
        result = result.replace(/{{#if (\w+)}}(.*?){{\/if}}/gs, (match, condition, content) => {
            return data[condition] ? content : '';
        });

        // Handle loops (basic implementation)
        result = result.replace(/{{#each (\w+)}}(.*?){{\/each}}/gs, (match, arrayName, content) => {
            if (!Array.isArray(data[arrayName])) return '';
            return data[arrayName].map(item => {
                let itemContent = content;
                if (typeof item === 'string') {
                    itemContent = itemContent.replace(/{{this}}/g, item);
                } else if (typeof item === 'object') {
                    for (const [key, value] of Object.entries(item)) {
                        itemContent = itemContent.replace(new RegExp(`{{${key}}}`, 'g'), value || '');
                    }
                }
                return itemContent;
            }).join('');
        });
        
        return result;
    }
}

const emailService = new EmailService();
module.exports = emailService;
module.exports.sendEmail = emailService.sendEmail.bind(emailService);
