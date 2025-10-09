const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Booking = require('../models/Booking');
const Payment = require('../models/Payment');
const User = require('../models/User');
const { sendEmail } = require('../services/emailService');

class PaymentController {
    // Create payment intent
    async createPaymentIntent(req, res) {
        try {
            const { bookingId } = req.body;

            const booking = await Booking.findOne({
                _id: bookingId,
                customerId: req.user.id,
                status: 'pending'
            }).populate('providerId serviceId');

            if (!booking) {
                return res.status(404).json({
                    success: false,
                    message: 'Booking not found or already processed'
                });
            }

            // Create Stripe payment intent
            const paymentIntent = await stripe.paymentIntents.create({
                amount: Math.round(booking.totalAmount * 100), // Convert to cents
                currency: 'inr',
                payment_method_types: ['card'],
                metadata: {
                    bookingId: booking._id.toString(),
                    customerId: req.user.id.toString(),
                    providerId: booking.providerId._id.toString()
                }
            });

            // Create payment record
            const payment = new Payment({
                bookingId: booking._id,
                customerId: req.user.id,
                providerId: booking.providerId._id,
                amount: booking.totalAmount,
                commission: booking.commission,
                providerAmount: booking.providerEarnings,
                gateway: 'stripe',
                gatewayTransactionId: paymentIntent.id,
                method: 'card',
                status: 'pending',
                metadata: {
                    ipAddress: req.ip,
                    userAgent: req.get('User-Agent')
                }
            });

            await payment.save();

            res.json({
                success: true,
                data: {
                    clientSecret: paymentIntent.client_secret,
                    paymentId: payment.paymentId
                }
            });

        } catch (error) {
            console.error('Create payment intent error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to create payment intent'
            });
        }
    }

    // Confirm payment
    async confirmPayment(req, res) {
        try {
            const { paymentIntentId, paymentId } = req.body;

            // Verify payment with Stripe
            const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

            if (paymentIntent.status !== 'succeeded') {
                return res.status(400).json({
                    success: false,
                    message: 'Payment not successful'
                });
            }

            // Update payment record
            const payment = await Payment.findOne({ 
                paymentId,
                customerId: req.user.id 
            });

            if (!payment) {
                return res.status(404).json({
                    success: false,
                    message: 'Payment record not found'
                });
            }

            await payment.markCompleted(paymentIntentId, paymentIntent);

            // Update booking status
            const booking = await Booking.findById(payment.bookingId);
            booking.status = 'accepted';
            booking.payment.status = 'paid';
            booking.payment.transactionId = paymentIntentId;
            booking.payment.paidAt = new Date();
            await booking.save();

            // Schedule payout to provider (after 24 hours for security)
            const payoutDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
            await payment.initiatePayout(payoutDate);

            // Send confirmation emails
            await this.sendPaymentConfirmationEmails(booking, payment);

            res.json({
                success: true,
                message: 'Payment confirmed successfully',
                data: { booking, payment }
            });

        } catch (error) {
            console.error('Confirm payment error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to confirm payment'
            });
        }
    }

    // Handle Stripe webhooks
    async handleStripeWebhook(req, res) {
        try {
            const sig = req.headers['stripe-signature'];
            const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

            let event;
            try {
                event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
            } catch (err) {
                console.error('Webhook signature verification failed:', err.message);
                return res.status(400).send('Webhook signature verification failed');
            }

            // Handle the event
            switch (event.type) {
                case 'payment_intent.succeeded':
                    await this.handlePaymentSuccess(event.data.object);
                    break;
                case 'payment_intent.payment_failed':
                    await this.handlePaymentFailure(event.data.object);
                    break;
                case 'payout.paid':
                    await this.handlePayoutSuccess(event.data.object);
                    break;
                case 'payout.failed':
                    await this.handlePayoutFailure(event.data.object);
                    break;
                default:
                    console.log(`Unhandled event type ${event.type}`);
            }

            res.json({ received: true });

        } catch (error) {
            console.error('Stripe webhook error:', error);
            res.status(500).json({
                success: false,
                message: 'Webhook processing failed'
            });
        }
    }

    // Process payouts
    async processPayouts(req, res) {
        try {
            // This would typically be called by a cron job
            const pendingPayouts = await Payment.find({
                'payout.status': 'pending',
                'payout.scheduledFor': { $lte: new Date() },
                status: 'completed'
            }).populate('providerId');

            const results = [];

            for (const payment of pendingPayouts) {
                try {
                    // Create Stripe payout (requires Stripe Connect)
                    const payout = await stripe.transfers.create({
                        amount: Math.round(payment.payout.amount * 100),
                        currency: 'inr',
                        destination: payment.providerId.stripeAccountId, // Provider's Stripe account
                        metadata: {
                            paymentId: payment.paymentId,
                            providerId: payment.providerId._id.toString()
                        }
                    });

                    // Update payment record
                    payment.payout.status = 'completed';
                    payment.payout.processedAt = new Date();
                    payment.payout.payoutTransactionId = payout.id;
                    await payment.save();

                    results.push({
                        paymentId: payment.paymentId,
                        status: 'success',
                        amount: payment.payout.amount
                    });

                    // Send payout notification
                    await this.sendPayoutNotification(payment);

                } catch (error) {
                    console.error(`Payout failed for payment ${payment.paymentId}:`, error);
                    
                    payment.payout.status = 'failed';
                    payment.payout.failureReason = error.message;
                    await payment.save();

                    results.push({
                        paymentId: payment.paymentId,
                        status: 'failed',
                        error: error.message
                    });
                }
            }

            res.json({
                success: true,
                data: {
                    processed: results.length,
                    results
                }
            });

        } catch (error) {
            console.error('Process payouts error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to process payouts'
            });
        }
    }

    // Get payment details
    async getPaymentDetails(req, res) {
        try {
            const { paymentId } = req.params;

            const payment = await Payment.findOne({
                paymentId,
                $or: [
                    { customerId: req.user.id },
                    { providerId: req.user.id }
                ]
            })
            .populate('bookingId', 'bookingId status')
            .populate('customerId', 'firstName lastName email')
            .populate('providerId', 'firstName lastName providerInfo.businessName');

            if (!payment) {
                return res.status(404).json({
                    success: false,
                    message: 'Payment not found'
                });
            }

            res.json({
                success: true,
                data: { payment }
            });

        } catch (error) {
            console.error('Get payment details error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch payment details'
            });
        }
    }

    // Request refund
    async requestRefund(req, res) {
        try {
            const { paymentId } = req.params;
            const { reason } = req.body;

            const payment = await Payment.findOne({
                paymentId,
                customerId: req.user.id,
                status: 'completed'
            }).populate('bookingId');

            if (!payment) {
                return res.status(404).json({
                    success: false,
                    message: 'Payment not found or not eligible for refund'
                });
            }

            // Check if booking allows refund (within policy)
            const booking = payment.bookingId;
            if (booking.status === 'completed') {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot refund completed orders'
                });
            }

            // Calculate refund amount based on booking status
            let refundAmount = payment.amount;
            if (booking.status === 'in_progress') {
                refundAmount = payment.amount * 0.5; // 50% refund if work started
            }

            // Create Stripe refund
            const refund = await stripe.refunds.create({
                payment_intent: payment.gatewayTransactionId,
                amount: Math.round(refundAmount * 100),
                reason: 'requested_by_customer',
                metadata: {
                    paymentId: payment.paymentId,
                    refundReason: reason
                }
            });

            // Update payment record
            payment.refund = {
                amount: refundAmount,
                reason,
                refundedAt: new Date(),
                refundTransactionId: refund.id,
                status: 'processed'
            };
            payment.status = 'refunded';
            await payment.save();

            // Update booking status
            booking.status = 'refunded';
            booking.payment.status = 'refunded';
            booking.payment.refundedAt = new Date();
            booking.payment.refundAmount = refundAmount;
            await booking.save();

            res.json({
                success: true,
                message: 'Refund processed successfully',
                data: {
                    refundAmount,
                    refundId: refund.id
                }
            });

        } catch (error) {
            console.error('Request refund error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to process refund'
            });
        }
    }

    // Helper methods
    async handlePaymentSuccess(paymentIntent) {
        const payment = await Payment.findOne({
            gatewayTransactionId: paymentIntent.id
        });

        if (payment && payment.status === 'pending') {
            await payment.markCompleted(paymentIntent.id, paymentIntent);
        }
    }

    async handlePaymentFailure(paymentIntent) {
        const payment = await Payment.findOne({
            gatewayTransactionId: paymentIntent.id
        });

        if (payment) {
            payment.status = 'failed';
            payment.failedAt = new Date();
            await payment.save();

            // Update booking status
            await Booking.findByIdAndUpdate(payment.bookingId, {
                status: 'cancelled',
                'payment.status': 'failed'
            });
        }
    }

    async handlePayoutSuccess(payout) {
        const payment = await Payment.findOne({
            'payout.payoutTransactionId': payout.id
        });

        if (payment) {
            payment.payout.status = 'completed';
            payment.payout.processedAt = new Date();
            await payment.save();
        }
    }

    async handlePayoutFailure(payout) {
        const payment = await Payment.findOne({
            'payout.payoutTransactionId': payout.id
        });

        if (payment) {
            payment.payout.status = 'failed';
            payment.payout.failureReason = payout.failure_message || 'Payout failed';
            await payment.save();
        }
    }

    async sendPaymentConfirmationEmails(booking, payment) {
        // Send to customer
        await sendEmail({
            to: booking.customerId.email,
            subject: 'Payment Confirmation - ServiceHub',
            template: 'paymentConfirmation',
            data: {
                customerName: `${booking.customerId.firstName} ${booking.customerId.lastName}`,
                bookingId: booking.bookingId,
                amount: payment.amount,
                serviceTitle: booking.serviceId.title
            }
        });

        // Send to provider
        await sendEmail({
            to: booking.providerId.email,
            subject: 'New Order Received - ServiceHub',
            template: 'orderReceived',
            data: {
                providerName: `${booking.providerId.firstName} ${booking.providerId.lastName}`,
                bookingId: booking.bookingId,
                earnings: payment.providerAmount,
                serviceTitle: booking.serviceId.title
            }
        });
    }

    async sendPayoutNotification(payment) {
        await sendEmail({
            to: payment.providerId.email,
            subject: 'Payout Processed - ServiceHub',
            template: 'payoutProcessed',
            data: {
                providerName: `${payment.providerId.firstName} ${payment.providerId.lastName}`,
                amount: payment.payout.amount,
                paymentId: payment.paymentId
            }
        });
    }
}

module.exports = new PaymentController();
