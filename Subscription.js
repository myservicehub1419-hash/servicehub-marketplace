const express = require('express');
const Razorpay = require('razorpay');
const { SubscriptionPlan, Subscription } = require('../models/Subscription');
const Provider = require('../models/Provider');
const { authenticateToken } = require('../middleware/auth');
const crypto = require('crypto');

const router = express.Router();

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Get all subscription plans
router.get('/plans', async (req, res) => {
  try {
    const plans = await SubscriptionPlan.find({ isActive: true }).sort({ sortOrder: 1 });
    
    res.json({
      success: true,
      plans: plans.map(plan => ({
        id: plan.planId,
        name: plan.name,
        description: plan.description,
        price: plan.price,
        interval: plan.interval,
        features: plan.features,
        commissionRate: plan.commissionRate,
        recommended: plan.planId === 'standard' // Mark standard as recommended
      }))
    });
  } catch (error) {
    console.error('Error fetching subscription plans:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching subscription plans'
    });
  }
});

// Create subscription
router.post('/create', authenticateToken, async (req, res) => {
  try {
    const { planId } = req.body;
    const providerId = req.user.id;

    // Get plan details
    const plan = await SubscriptionPlan.findOne({ planId, isActive: true });
    if (!plan) {
      return res.status(400).json({
        success: false,
        message: 'Invalid subscription plan'
      });
    }

    // Get provider
    const provider = await Provider.findById(providerId);
    if (!provider) {
      return res.status(404).json({
        success: false,
        message: 'Provider not found'
      });
    }

    // Check if provider already has an active subscription
    const existingSubscription = await Subscription.findOne({
      providerId,
      status: { $in: ['active', 'authenticated'] }
    });

    if (existingSubscription) {
      return res.status(400).json({
        success: false,
        message: 'You already have an active subscription'
      });
    }

    // Create Razorpay customer if not exists
    let customerId = provider.razorpayCustomerId;
    if (!customerId) {
      const customer = await razorpay.customers.create({
        name: provider.name,
        email: provider.email,
        contact: provider.phone
      });
      customerId = customer.id;
      
      // Update provider with customer ID
      provider.razorpayCustomerId = customerId;
      await provider.save();
    }

    // Create Razorpay subscription
    const razorpaySubscription = await razorpay.subscriptions.create({
      plan_id: plan.razorpayPlanId, // You'll need to create these plans in Razorpay dashboard
      customer_notify: 1,
      total_count: plan.interval === 'yearly' ? 12 : 120, // 1 year or 10 years
      quantity: 1,
      notes: {
        provider_id: providerId,
        plan_name: plan.name
      }
    });

    // Create subscription record
    const subscription = new Subscription({
      providerId,
      planId: plan.planId,
      razorpaySubscriptionId: razorpaySubscription.id,
      razorpayCustomerId: customerId,
      status: 'created',
      amount: plan.price,
      currency: plan.currency,
      nextBilling: new Date(razorpaySubscription.current_start * 1000)
    });

    await subscription.save();

    res.json({
      success: true,
      message: 'Subscription created successfully',
      subscription: {
        id: subscription._id,
        razorpaySubscriptionId: razorpaySubscription.id,
        planName: plan.name,
        amount: plan.price,
        status: 'created'
      },
      razorpaySubscription
    });

  } catch (error) {
    console.error('Error creating subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating subscription'
    });
  }
});

// Handle Razorpay webhook for subscription updates
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const shasum = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET);
    shasum.update(JSON.stringify(req.body));
    const digest = shasum.digest('hex');

    // Verify webhook signature
    if (digest !== req.get('X-Razorpay-Signature')) {
      return res.status(400).json({ success: false, message: 'Invalid signature' });
    }

    const event = req.body;

    switch (event.event) {
      case 'subscription.authenticated':
        await handleSubscriptionAuthenticated(event.payload.subscription.entity);
        break;
      
      case 'subscription.activated':
        await handleSubscriptionActivated(event.payload.subscription.entity);
        break;
      
      case 'subscription.cancelled':
        await handleSubscriptionCancelled(event.payload.subscription.entity);
        break;
      
      case 'payment.captured':
        await handlePaymentCaptured(event.payload.payment.entity);
        break;
    }

    res.json({ success: true });

  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ success: false, message: 'Webhook processing failed' });
  }
});

// Helper functions for webhook handling
async function handleSubscriptionAuthenticated(razorpaySubscription) {
  const subscription = await Subscription.findOne({
    razorpaySubscriptionId: razorpaySubscription.id
  });

  if (subscription) {
    subscription.status = 'authenticated';
    await subscription.save();
  }
}

async function handleSubscriptionActivated(razorpaySubscription) {
  const subscription = await Subscription.findOne({
    razorpaySubscriptionId: razorpaySubscription.id
  }).populate('providerId');

  if (subscription) {
    // Update subscription
    subscription.status = 'active';
    subscription.currentPeriodStart = new Date(razorpaySubscription.current_start * 1000);
    subscription.currentPeriodEnd = new Date(razorpaySubscription.current_end * 1000);
    await subscription.save();

    // Update provider
    const provider = subscription.providerId;
    provider.subscriptionStatus = 'active';
    provider.subscriptionPlan = subscription.planId;
    provider.subscriptionExpiry = subscription.currentPeriodEnd;
    provider.onboardingStep = Math.max(provider.onboardingStep, 4); // Move to profile setup
    await provider.save();
  }
}

async function handleSubscriptionCancelled(razorpaySubscription) {
  const subscription = await Subscription.findOne({
    razorpaySubscriptionId: razorpaySubscription.id
  }).populate('providerId');

  if (subscription) {
    subscription.status = 'cancelled';
    subscription.cancelledAt = new Date();
    await subscription.save();

    // Update provider
    const provider = subscription.providerId;
    provider.subscriptionStatus = 'cancelled';
    await provider.save();
  }
}

async function handlePaymentCaptured(payment) {
  if (payment.notes && payment.notes.subscription_id) {
    const subscription = await Subscription.findOne({
      razorpaySubscriptionId: payment.notes.subscription_id
    });

    if (subscription) {
      // Add to billing history
      subscription.billingHistory.push({
        date: new Date(payment.created_at * 1000),
        amount: payment.amount / 100, // Convert paise to rupees
        status: 'success',
        paymentId: payment.id
      });
      await subscription.save();
    }
  }
}

module.exports = router;
