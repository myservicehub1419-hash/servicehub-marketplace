const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Payment = require('../models/Payment');
const Booking = require('../models/Booking');

class PaymentService {
    constructor() {
        this.stripe = stripe;
        this.webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    }

    // Create payment intent with Stripe
    async createPaymentIntent(amount, currency = 'inr', metadata = {}) {
        try {
            const paymentIntent = await this.stripe.paymentIntents.create({
                amount: Math.round(amount * 100), // Convert to smallest currency unit
                currency,
                payment_method_types: ['card'],
                capture_method: 'automatic',
                metadata,
                description: `ServiceHub Payment - ${metadata.bookingId || 'N/A'}`
            });

            return {
                success: true,
                clientSecret: paymentIntent.client_secret,
                paymentIntentId: paymentIntent.id
            };

        } catch (error) {
            console.error('Create payment intent error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Confirm payment intent
    async confirmPaymentIntent(paymentIntentId) {
        try {
            const paymentIntent = await this.stripe.paymentIntents.confirm(paymentIntentId);
            
            return {
                success: paymentIntent.status === 'succeeded',
                status: paymentIntent.status,
                paymentIntent
            };

        } catch (error) {
            console.error('Confirm payment intent error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Retrieve payment intent
    async getPaymentIntent(paymentIntentId) {
        try {
            const paymentIntent = await this.stripe.paymentIntents.retrieve(paymentIntentId);
            return {
                success: true,
                paymentIntent
            };

        } catch (error) {
            console.error('Get payment intent error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Create refund
    async createRefund(paymentIntentId, amount, reason = 'requested_by_customer') {
        try {
            const refund = await this.stripe.refunds.create({
                payment_intent: paymentIntentId,
                amount: amount ? Math.round(amount * 100) : undefined, // Partial or full refund
                reason,
                metadata: {
                    refundedAt: new Date().toISOString()
                }
            });

            return {
                success: true,
                refund
            };

        } catch (error) {
            console.error('Create refund error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Create payout (transfer to provider)
    async createPayout(amount, destination, metadata = {}) {
        try {
            // This requires Stripe Connect setup
            const transfer = await this.stripe.transfers.create({
                amount: Math.round(amount * 100),
                currency: 'inr',
                destination, // Provider's Stripe Connect account ID
                metadata
            });

            return {
                success: true,
                transfer
            };

        } catch (error) {
            console.error('Create payout error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Handle webhook events
    async processWebhook(rawBody, signature) {
        try {
            const event = this.stripe.webhooks.constructEvent(
                rawBody,
                signature,
                this.webhookSecret
            );

            console.log('Processing webhook event:', event.type);

            switch (event.type) {
                case 'payment_intent.succeeded':
                    await this.handlePaymentSuccess(event.data.object);
                    break;

                case 'payment_intent.payment_failed':
                    await this.handlePaymentFailure(event.data.object);
                    break;

                case 'payment_intent.canceled':
                    await this.handlePaymentCancellation(event.data.object);
                    break;

                case 'transfer.created':
                    await this.handleTransferCreated(event.data.object);
                    break;

                case 'transfer.paid':
                    await this.handleTransferPaid(event.data.object);
                    break;

                case 'transfer.failed':
                    await this.handleTransferFailed(event.data.object);
                    break;

                default:
                    console.log(`Unhandled event type: ${event.type}`);
            }

            return { success: true, processed: true };

        } catch (error) {
            console.error('Webhook processing error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Webhook event handlers
    async handlePaymentSuccess(paymentIntent) {
        try {
            const payment = await Payment.findOne({
                gatewayTransactionId: paymentIntent.id
            });

            if (payment && payment.status === 'pending') {
                payment.status = 'completed';
                payment.completedAt = new Date();
                payment.gatewayResponse = paymentIntent;
                await payment.save();

                // Update booking status
                await Booking.findByIdAndUpdate(payment.bookingId, {
                    status: 'accepted',
                    'payment.status': 'paid',
                    'payment.paidAt': new Date()
                });

                console.log(`Payment completed: ${payment.paymentId}`);
            }

        } catch (error) {
            console.error('Handle payment success error:', error);
        }
    }

    async handlePaymentFailure(paymentIntent) {
        try {
            const payment = await Payment.findOne({
                gatewayTransactionId: paymentIntent.id
            });

            if (payment) {
                payment.status = 'failed';
                payment.failedAt = new Date();
                payment.gatewayResponse = paymentIntent;
                await payment.save();

                // Update booking status
                await Booking.findByIdAndUpdate(payment.bookingId, {
                    status: 'cancelled',
                    'payment.status': 'failed'
                });

                console.log(`Payment failed: ${payment.paymentId}`);
            }

        } catch (error) {
            console.error('Handle payment failure error:', error);
        }
    }

    async handlePaymentCancellation(paymentIntent) {
        try {
            const payment = await Payment.findOne({
                gatewayTransactionId: paymentIntent.id
            });

            if (payment) {
                payment.status = 'cancelled';
                payment.gatewayResponse = paymentIntent;
                await payment.save();

                // Update booking status
                await Booking.findByIdAndUpdate(payment.bookingId, {
                    status: 'cancelled',
                    'payment.status': 'cancelled'
                });

                console.log(`Payment cancelled: ${payment.paymentId}`);
            }

        } catch (error) {
            console.error('Handle payment cancellation error:', error);
        }
    }

    async handleTransferCreated(transfer) {
        try {
            const payment = await Payment.findOne({
                'payout.payoutTransactionId': transfer.id
            });

            if (payment) {
                payment.payout.status = 'processing';
                await payment.save();
                console.log(`Transfer created: ${transfer.id}`);
            }

        } catch (error) {
            console.error('Handle transfer created error:', error);
        }
    }

    async handleTransferPaid(transfer) {
        try {
            const payment = await Payment.findOne({
                'payout.payoutTransactionId': transfer.id
            });

            if (payment) {
                payment.payout.status = 'completed';
                payment.payout.processedAt = new Date();
                await payment.save();
                console.log(`Transfer paid: ${transfer.id}`);
            }

        } catch (error) {
            console.error('Handle transfer paid error:', error);
        }
    }

    async handleTransferFailed(transfer) {
        try {
            const payment = await Payment.findOne({
                'payout.payoutTransactionId': transfer.id
            });

            if (payment) {
                payment.payout.status = 'failed';
                payment.payout.failureReason = transfer.failure_message || 'Transfer failed';
                await payment.save();
                console.log(`Transfer failed: ${transfer.id}`);
            }

        } catch (error) {
            console.error('Handle transfer failed error:', error);
        }
    }

    // Utility methods
    async getAccountBalance() {
        try {
            const balance = await this.stripe.balance.retrieve();
            return {
                success: true,
                balance
            };

        } catch (error) {
            console.error('Get account balance error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async getTransactionHistory(limit = 10, startingAfter = null) {
        try {
            const charges = await this.stripe.charges.list({
                limit,
                starting_after: startingAfter
            });

            return {
                success: true,
                charges
            };

        } catch (error) {
            console.error('Get transaction history error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Calculate platform fees
    calculateCommission(amount, commissionRate = 15) {
        const commission = (amount * commissionRate) / 100;
        const providerAmount = amount - commission;
        
        return {
            totalAmount: amount,
            commission: {
                rate: commissionRate,
                amount: commission
            },
            providerAmount
        };
    }

    // Validate payment amounts
    validatePaymentAmount(amount, currency = 'inr') {
        const minAmounts = {
            'inr': 0.50, // 50 paise minimum
            'usd': 0.50
        };

        const maxAmounts = {
            'inr': 999999, // ~10 lakh
            'usd': 999999
        };

        const min = minAmounts[currency.toLowerCase()] || minAmounts['inr'];
        const max = maxAmounts[currency.toLowerCase()] || maxAmounts['inr'];

        if (amount < min) {
            return {
                valid: false,
                error: `Amount must be at least ${min} ${currency.toUpperCase()}`
            };
        }

        if (amount > max) {
            return {
                valid: false,
                error: `Amount cannot exceed ${max} ${currency.toUpperCase()}`
            };
        }

        return { valid: true };
    }
}

// Export singleton instance
const paymentService = new PaymentService();
module.exports = paymentService;
