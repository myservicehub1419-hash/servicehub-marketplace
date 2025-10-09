const User = require('../models/User');
const Service = require('../models/Service');
const Booking = require('../models/Booking');
const Payment = require('../models/Payment');
const SubscriptionPlan = require('../models/SubscriptionPlan');
const { sendEmail } = require('../services/emailService');
const { sendWhatsAppMessage, sendWebNotification } = require('../services/notificationService');

class ProviderController {
    // Step 3: Get premium plans for provider
    async getPremiumPlans(req, res) {
        try {
            const plans = [
                {
                    id: 'basic',
                    name: 'Basic Plan',
                    price: 999,
                    duration: 30, // days
                    features: [
                        'Create up to 3 services',
                        'Basic profile customization',
                        'Standard support',
                        '15% commission rate',
                        'Basic analytics'
                    ],
                    limits: {
                        maxServices: 3,
                        maxImages: 5,
                        prioritySupport: false,
                        analyticsLevel: 'basic'
                    }
                },
                {
                    id: 'premium',
                    name: 'Premium Plan',
                    price: 2499,
                    duration: 30,
                    features: [
                        'Create up to 10 services',
                        'Advanced profile customization',
                        'Priority support',
                        '12% commission rate',
                        'Advanced analytics',
                        'Featured service listing',
                        'Custom portfolio showcase'
                    ],
                    limits: {
                        maxServices: 10,
                        maxImages: 15,
                        prioritySupport: true,
                        analyticsLevel: 'advanced',
                        featuredListing: true
                    },
                    popular: true
                },
                {
                    id: 'enterprise',
                    name: 'Enterprise Plan',
                    price: 4999,
                    duration: 30,
                    features: [
                        'Unlimited services',
                        'Premium profile customization',
                        '24/7 dedicated support',
                        '10% commission rate',
                        'Complete analytics suite',
                        'Top featured listing',
                        'Custom branding options',
                        'API access',
                        'Bulk order management'
                    ],
                    limits: {
                        maxServices: -1, // unlimited
                        maxImages: -1,
                        prioritySupport: true,
                        analyticsLevel: 'enterprise',
                        featuredListing: true,
                        customBranding: true
                    }
                }
            ];

            res.json({
                success: true,
                data: { plans }
            });

        } catch (error) {
            console.error('Get premium plans error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to load premium plans'
            });
        }
    }

    // Step 3: Subscribe to premium plan
    async subscribeToPlan(req, res) {
        try {
            const { planId } = req.body;
            
            const planDetails = {
                'basic': { price: 999, commission: 15, maxServices: 3 },
                'premium': { price: 2499, commission: 12, maxServices: 10 },
                'enterprise': { price: 4999, commission: 10, maxServices: -1 }
            };

            const plan = planDetails[planId];
            if (!plan) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid plan selected'
                });
            }

            // Create payment intent for plan subscription
            const paymentIntent = await this.createPaymentIntent(
                plan.price,
                {
                    type: 'subscription',
                    planId: planId,
                    providerId: req.user.id
                }
            );

            res.json({
                success: true,
                message: 'Payment intent created for subscription',
                data: {
                    clientSecret: paymentIntent.clientSecret,
                    planId,
                    amount: plan.price
                }
            });

        } catch (error) {
            console.error('Subscribe to plan error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to process subscription'
            });
        }
    }

    // Step 4: Account setup - Profile, past works, experience
    async setupAccount(req, res) {
        try {
            const {
                businessName,
                description,
                skills,
                experience,
                portfolio,
                workSamples,
                education,
                certifications,
                languages,
                workingHours,
                responseTime
            } = req.body;

            const provider = await User.findById(req.user.id);

            // Update provider profile
            provider.providerInfo.businessName = businessName;
            provider.providerInfo.description = description;
            provider.providerInfo.skills = skills || [];
            provider.providerInfo.experience = experience;
            provider.providerInfo.portfolio = portfolio || [];
            provider.providerInfo.workSamples = workSamples || [];
            provider.providerInfo.education = education || [];
            provider.providerInfo.certifications = certifications || [];
            provider.providerInfo.languages = languages || ['English'];
            provider.providerInfo.workingHours = workingHours || '9 AM - 6 PM';
            provider.providerInfo.responseTime = responseTime || '2 hours';
            provider.providerInfo.profileCompleted = true;

            await provider.save();

            res.json({
                success: true,
                message: 'Account setup completed successfully',
                data: {
                    provider: provider.getPublicProfile()
                }
            });

        } catch (error) {
            console.error('Setup account error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to complete account setup'
            });
        }
    }

    // Step 5: Provider dashboard
    async getDashboard(req, res) {
        try {
            const providerId = req.user.id;
            
            // Get dashboard statistics
            const [
                totalServices,
                pendingOrders,
                activeOrders,
                completedOrders,
                monthlyEarnings,
                totalEarnings,
                newMessages,
                profileViews
            ] = await Promise.all([
                Service.countDocuments({ providerId }),
                Booking.countDocuments({ providerId, status: 'pending_approval' }),
                Booking.countDocuments({ providerId, status: { $in: ['accepted', 'in_progress'] } }),
                Booking.countDocuments({ providerId, status: 'completed' }),
                this.getMonthlyEarnings(providerId),
                this.getTotalEarnings(providerId),
                this.getUnreadMessagesCount(providerId),
                this.getProfileViews(providerId)
            ]);

            res.json({
                success: true,
                data: {
                    stats: {
                        totalServices,
                        pendingOrders,
                        activeOrders,
                        completedOrders,
                        monthlyEarnings,
                        totalEarnings,
                        newMessages,
                        profileViews
                    },
                    quickActions: [
                        {
                            title: 'View New Orders',
                            description: `${pendingOrders} new service requests`,
                            link: '/provider/orders/pending',
                            badge: pendingOrders
                        },
                        {
                            title: 'Active Projects',
                            description: `${activeOrders} ongoing projects`,
                            link: '/provider/orders/active'
                        },
                        {
                            title: 'Messages',
                            description: `${newMessages} unread messages`,
                            link: '/provider/messages',
                            badge: newMessages
                        }
                    ]
                }
            });

        } catch (error) {
            console.error('Provider dashboard error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to load dashboard'
            });
        }
    }

    // Step 6: View new service requests
    async getNewServiceRequests(req, res) {
        try {
            const { page = 1, limit = 10 } = req.query;

            const pendingBookings = await Booking.find({
                providerId: req.user.id,
                status: 'pending_approval'
            })
            .populate('customerId', 'firstName lastName avatar phone email')
            .populate('serviceId', 'title')
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit));

            const total = await Booking.countDocuments({
                providerId: req.user.id,
                status: 'pending_approval'
            });

            res.json({
                success: true,
                data: {
                    requests: pendingBookings.map(booking => ({
                        _id: booking._id,
                        bookingId: booking.bookingId,
                        customer: {
                            name: `${booking.customerId.firstName} ${booking.customerId.lastName}`,
                            avatar: booking.customerId.avatar,
                            phone: booking.customerId.phone,
                            email: booking.customerId.email
                        },
                        service: {
                            title: booking.serviceId.title
                        },
                        project: {
                            title: booking.projectTitle,
                            description: booking.projectDescription,
                            requirements: booking.requirements,
                            deadline: booking.deadline
                        },
                        package: booking.packageSelected,
                        totalAmount: booking.totalAmount,
                        providerEarnings: booking.providerEarnings,
                        createdAt: booking.createdAt,
                        attachments: booking.attachments
                    })),
                    pagination: {
                        page: parseInt(page),
                        limit: parseInt(limit),
                        total,
                        pages: Math.ceil(total / limit)
                    }
                }
            });

        } catch (error) {
            console.error('Get new service requests error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch service requests'
            });
        }
    }

    // Step 7: Accept service request
    async acceptServiceRequest(req, res) {
        try {
            const { bookingId } = req.params;
            const { message, estimatedDelivery } = req.body;

            const booking = await Booking.findOne({
                _id: bookingId,
                providerId: req.user.id,
                status: 'pending_approval'
            })
            .populate('customerId', 'firstName lastName email phone')
            .populate('serviceId', 'title');

            if (!booking) {
                return res.status(404).json({
                    success: false,
                    message: 'Service request not found'
                });
            }

            // Update booking status
            booking.status = 'accepted';
            booking.acceptedAt = new Date();
            booking.providerMessage = message;
            if (estimatedDelivery) {
                booking.expectedDelivery = new Date(estimatedDelivery);
            }

            // Add acceptance message
            booking.messages.push({
                senderId: req.user.id,
                message: message || 'I have accepted your project and will start working on it soon.',
                timestamp: new Date()
            });

            await booking.save();

            // Step 9: Send notifications to customer
            await this.sendAcceptanceNotifications(booking);

            res.json({
                success: true,
                message: 'Service request accepted successfully'
            });

        } catch (error) {
            console.error('Accept service request error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to accept service request'
            });
        }
    }

    // Step 9: Send acceptance notifications (Email, WhatsApp, Web)
    async sendAcceptanceNotifications(booking) {
        try {
            const customerName = `${booking.customerId.firstName} ${booking.customerId.lastName}`;
            const customerEmail = booking.customerId.email;
            const customerPhone = booking.customerId.phone;

            // Send email notification
            await sendEmail({
                to: customerEmail,
                subject: 'Service Provider Accepted Your Request - ServiceHub',
                template: 'serviceAccepted',
                data: {
                    customerName,
                    projectTitle: booking.projectTitle,
                    providerName: `${req.user.firstName} ${req.user.lastName}`,
                    serviceTitle: booking.serviceId.title,
                    expectedDelivery: booking.expectedDelivery,
                    bookingId: booking.bookingId,
                    chatUrl: `${process.env.FRONTEND_URL}/customer/booking/${booking._id}/chat`
                }
            });

            // Send WhatsApp message
            await sendWhatsAppMessage({
                to: customerPhone,
                message: `🎉 Great news! Your service request "${booking.projectTitle}" has been accepted by the provider. They will start working on your project soon. Track progress: ${process.env.FRONTEND_URL}/customer/booking/${booking._id}`
            });

            // Send web notification
            await sendWebNotification({
                userId: booking.customerId._id,
                title: 'Service Request Accepted!',
                message: `Your project "${booking.projectTitle}" has been accepted and work will begin soon.`,
                type: 'booking_accepted',
                data: {
                    bookingId: booking._id,
                    projectTitle: booking.projectTitle
                }
            });

        } catch (error) {
            console.error('Send acceptance notifications error:', error);
        }
    }

    // Step 8: Complete job and trigger final payment
    async completeJob(req, res) {
        try {
            const { bookingId } = req.params;
            const { deliverables, completionMessage } = req.body;

            const booking = await Booking.findOne({
                _id: bookingId,
                providerId: req.user.id,
                status: 'in_progress'
            })
            .populate('customerId', 'firstName lastName email');

            if (!booking) {
                return res.status(404).json({
                    success: false,
                    message: 'Active booking not found'
                });
            }

            // Update booking status
            booking.status = 'delivered';
            booking.actualDelivery = new Date();
            booking.deliverables = deliverables || [];
            booking.paymentStage = 'remaining'; // Now customer needs to pay remaining amount

            // Add completion message
            booking.messages.push({
                senderId: req.user.id,
                message: completionMessage || 'Your project has been completed! Please review the deliverables.',
                timestamp: new Date()
            });

            await booking.save();

            // Notify customer about completion and remaining payment
            await this.sendJobCompletionNotification(booking, completionMessage);

            res.json({
                success: true,
                message: 'Job completed successfully. Customer will be notified for final payment.'
            });

        } catch (error) {
            console.error('Complete job error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to complete job'
            });
        }
    }

    // Send job completion notification
    async sendJobCompletionNotification(booking, message) {
        try {
            const customerEmail = booking.customerId.email;
            
            await sendEmail({
                to: customerEmail,
                subject: 'Your Project is Complete - Final Payment Required',
                template: 'jobCompleted',
                data: {
                    customerName: `${booking.customerId.firstName} ${booking.customerId.lastName}`,
                    projectTitle: booking.projectTitle,
                    completionMessage: message,
                    remainingAmount: booking.remainingAmount,
                    paymentUrl: `${process.env.FRONTEND_URL}/customer/booking/${booking._id}/final-payment`,
                    bookingId: booking.bookingId
                }
            });

        } catch (error) {
            console.error('Send job completion notification error:', error);
        }
    }

    // Helper methods
    async getMonthlyEarnings(providerId) {
        const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        const result = await Payment.aggregate([
            {
                $match: {
                    providerId: providerId,
                    status: 'completed',
                    completedAt: { $gte: startOfMonth }
                }
            },
            { $group: { _id: null, total: { $sum: '$providerAmount' } } }
        ]);
        return result[0]?.total || 0;
    }

    async getTotalEarnings(providerId) {
        const result = await Payment.aggregate([
            { $match: { providerId: providerId, status: 'completed' } },
            { $group: { _id: null, total: { $sum: '$providerAmount' } } }
        ]);
        return result[0]?.total || 0;
    }

    async getUnreadMessagesCount(providerId) {
        const result = await Booking.aggregate([
            { $match: { providerId: providerId } },
            { $unwind: '$messages' },
            {
                $match: {
                    'messages.senderId': { $ne: providerId },
                    'messages.isRead': false
                }
            },
            { $group: { _id: null, count: { $sum: 1 } } }
        ]);
        return result[0]?.count || 0;
    }

    async getProfileViews(providerId) {
        const result = await User.findById(providerId).select('providerInfo.profileViews');
        return result?.providerInfo?.profileViews || 0;
    }
}

module.exports = new ProviderController();
