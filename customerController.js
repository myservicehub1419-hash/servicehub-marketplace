const User = require('../models/User');
const Service = require('../models/Service');
const Booking = require('../models/Booking');
const Payment = require('../models/Payment');
const { sendEmail } = require('../services/emailService');
const { sendWhatsAppMessage, sendWebNotification } = require('../services/notificationService');

class CustomerController {
    // Step 3: Customer dashboard with services display
    async getDashboard(req, res) {
        try {
            const customerId = req.user.id;

            // Get customer stats
            const [totalBookings, activeBookings, completedBookings, totalSpent] = await Promise.all([
                Booking.countDocuments({ customerId }),
                Booking.countDocuments({ customerId, status: { $in: ['pending', 'accepted', 'in_progress'] } }),
                Booking.countDocuments({ customerId, status: 'completed' }),
                Payment.aggregate([
                    { $match: { customerId: customerId, status: 'completed' } },
                    { $group: { _id: null, total: { $sum: '$amount' } } }
                ])
            ]);

            // Step 4: Get services with sub-services and "Book Now" option
            const featuredServices = await Service.find({
                status: 'active',
                isApproved: true
            })
            .populate('providerId', 'firstName lastName providerInfo.businessName providerInfo.rating avatar')
            .sort({ 'rating.average': -1, orders: -1 })
            .limit(8);

            // Get services by category
            const servicesByCategory = await Service.aggregate([
                { $match: { status: 'active', isApproved: true } },
                {
                    $lookup: {
                        from: 'users',
                        localField: 'providerId',
                        foreignField: '_id',
                        as: 'provider'
                    }
                },
                { $unwind: '$provider' },
                {
                    $group: {
                        _id: '$category',
                        services: {
                            $push: {
                                _id: '$_id',
                                title: '$title',
                                shortDescription: '$shortDescription',
                                subcategory: '$subcategory',
                                pricing: '$pricing',
                                rating: '$rating',
                                images: '$images',
                                provider: {
                                    firstName: '$provider.firstName',
                                    lastName: '$provider.lastName',
                                    businessName: '$provider.providerInfo.businessName',
                                    rating: '$provider.providerInfo.rating'
                                }
                            }
                        },
                        count: { $sum: 1 }
                    }
                },
                { $sort: { count: -1 } }
            ]);

            // Recent bookings
            const recentBookings = await Booking.find({ customerId })
                .populate('serviceId', 'title images')
                .populate('providerId', 'firstName lastName providerInfo.businessName')
                .sort({ createdAt: -1 })
                .limit(5);

            res.json({
                success: true,
                data: {
                    customerStats: {
                        totalBookings,
                        activeBookings,
                        completedBookings,
                        totalSpent: totalSpent[0]?.total || 0
                    },
                    featuredServices,
                    servicesByCategory,
                    recentBookings
                }
            });

        } catch (error) {
            console.error('Dashboard error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to load dashboard'
            });
        }
    }

    // Step 5: Get booking form when customer clicks "Book Now"
    async getBookingForm(req, res) {
        try {
            const { serviceId } = req.params;

            const service = await Service.findById(serviceId)
                .populate('providerId', 'firstName lastName providerInfo.businessName providerInfo.rating avatar phone email');

            if (!service || service.status !== 'active' || !service.isApproved) {
                return res.status(404).json({
                    success: false,
                    message: 'Service not available'
                });
            }

            res.json({
                success: true,
                data: {
                    service: {
                        _id: service._id,
                        title: service.title,
                        description: service.description,
                        pricing: service.pricing,
                        deliveryTime: service.deliveryTime,
                        revisions: service.revisions,
                        requirements: service.requirements,
                        faq: service.faq,
                        images: service.images,
                        provider: service.providerId
                    },
                    bookingForm: {
                        fields: [
                            {
                                name: 'selectedPackage',
                                type: 'select',
                                label: 'Select Package',
                                required: true,
                                options: service.pricing.packages.map(pkg => ({
                                    value: pkg.name,
                                    label: `${pkg.name} - ₹${pkg.price}`,
                                    price: pkg.price,
                                    deliveryDays: pkg.deliveryDays,
                                    features: pkg.features
                                }))
                            },
                            {
                                name: 'projectTitle',
                                type: 'text',
                                label: 'Project Title',
                                required: true,
                                maxLength: 100
                            },
                            {
                                name: 'projectDescription',
                                type: 'textarea',
                                label: 'Project Description',
                                required: true,
                                maxLength: 1000
                            },
                            {
                                name: 'requirements',
                                type: 'textarea',
                                label: 'Specific Requirements',
                                required: false,
                                maxLength: 500
                            },
                            {
                                name: 'deadline',
                                type: 'date',
                                label: 'Preferred Deadline',
                                required: false
                            },
                            {
                                name: 'attachments',
                                type: 'file',
                                label: 'Reference Files (Optional)',
                                multiple: true,
                                maxFiles: 5,
                                acceptedTypes: ['image/*', '.pdf', '.doc', '.docx']
                            }
                        ]
                    }
                }
            });

        } catch (error) {
            console.error('Get booking form error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to load booking form'
            });
        }
    }

    // Step 6: Create booking with half payment
    async createBookingWithHalfPayment(req, res) {
        try {
            const {
                serviceId,
                selectedPackage,
                projectTitle,
                projectDescription,
                requirements,
                deadline,
                attachments
            } = req.body;

            // Get service details
            const service = await Service.findById(serviceId).populate('providerId');
            if (!service || service.status !== 'active') {
                return res.status(404).json({
                    success: false,
                    message: 'Service not available'
                });
            }

            // Find selected package
            const packageDetails = service.pricing.packages.find(pkg => pkg.name === selectedPackage);
            if (!packageDetails) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid package selected'
                });
            }

            // Calculate amounts - Half payment initially
            const totalAmount = packageDetails.price;
            const halfAmount = totalAmount / 2;
            const commissionRate = service.providerId.providerInfo.commission || 15;
            const commissionAmount = (totalAmount * commissionRate) / 100;
            const providerEarnings = totalAmount - commissionAmount;

            // Create booking with half payment requirement
            const booking = new Booking({
                customerId: req.user.id,
                providerId: service.providerId._id,
                serviceId: serviceId,
                projectTitle,
                projectDescription,
                requirements,
                deadline,
                packageSelected: packageDetails,
                baseAmount: totalAmount,
                totalAmount: totalAmount,
                halfAmount: halfAmount,
                remainingAmount: halfAmount,
                commission: {
                    rate: commissionRate,
                    amount: commissionAmount
                },
                providerEarnings,
                expectedDelivery: deadline || new Date(Date.now() + packageDetails.deliveryDays * 24 * 60 * 60 * 1000),
                revisions: {
                    allowed: packageDetails.revisions
                },
                attachments: attachments || [],
                status: 'pending_payment', // Waiting for half payment
                paymentStage: 'half' // First payment stage
            });

            await booking.save();

            res.status(201).json({
                success: true,
                message: 'Booking created successfully. Please make half payment to proceed.',
                data: {
                    booking: {
                        bookingId: booking.bookingId,
                        _id: booking._id,
                        totalAmount: totalAmount,
                        halfAmount: halfAmount,
                        paymentRequired: halfAmount
                    }
                }
            });

        } catch (error) {
            console.error('Create booking error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to create booking'
            });
        }
    }

    // Step 7: After half payment, send booking form to provider
    async processHalfPaymentSuccess(bookingId, paymentDetails) {
        try {
            const booking = await Booking.findById(bookingId)
                .populate('customerId', 'firstName lastName email phone')
                .populate('providerId', 'firstName lastName email phone providerInfo.businessName')
                .populate('serviceId', 'title');

            // Update booking status
            booking.status = 'pending_approval';
            booking.payment.halfPaid = true;
            booking.payment.halfPaidAt = new Date();
            booking.payment.halfPaymentId = paymentDetails.paymentId;
            await booking.save();

            // Send booking request to provider
            await this.sendBookingRequestToProvider(booking);

            return { success: true };

        } catch (error) {
            console.error('Process half payment success error:', error);
            return { success: false, error: error.message };
        }
    }

    // Send booking request to provider via email
    async sendBookingRequestToProvider(booking) {
        const providerEmail = booking.providerId.email;
        
        await sendEmail({
            to: providerEmail,
            subject: 'New Service Request - ServiceHub',
            template: 'newBookingRequest',
            data: {
                providerName: `${booking.providerId.firstName} ${booking.providerId.lastName}`,
                customerName: `${booking.customerId.firstName} ${booking.customerId.lastName}`,
                customerPhone: booking.customerId.phone,
                projectTitle: booking.projectTitle,
                projectDescription: booking.projectDescription,
                requirements: booking.requirements,
                serviceTitle: booking.serviceId.title,
                packageName: booking.packageSelected.name,
                totalAmount: booking.totalAmount,
                providerEarnings: booking.providerEarnings,
                deadline: booking.deadline,
                bookingId: booking.bookingId,
                dashboardUrl: `${process.env.FRONTEND_URL}/provider/booking/${booking._id}`
            }
        });
    }

    // Step 10: Process remaining payment after work completion
    async processRemainingPayment(req, res) {
        try {
            const { bookingId } = req.params;

            const booking = await Booking.findOne({
                _id: bookingId,
                customerId: req.user.id,
                status: 'delivered',
                paymentStage: 'remaining'
            });

            if (!booking) {
                return res.status(404).json({
                    success: false,
                    message: 'Booking not found or not eligible for final payment'
                });
            }

            // Create payment intent for remaining amount
            const paymentIntent = await this.createPaymentIntent(
                booking.remainingAmount,
                {
                    bookingId: booking._id.toString(),
                    paymentStage: 'final',
                    customerId: req.user.id.toString(),
                    providerId: booking.providerId.toString()
                }
            );

            res.json({
                success: true,
                message: 'Payment intent created for final payment',
                data: {
                    clientSecret: paymentIntent.clientSecret,
                    amount: booking.remainingAmount,
                    bookingId: booking.bookingId
                }
            });

        } catch (error) {
            console.error('Process remaining payment error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to process remaining payment'
            });
        }
    }
}

module.exports = new CustomerController();
