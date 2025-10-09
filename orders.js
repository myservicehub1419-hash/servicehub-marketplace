const express = require('express');
const Order = require('../models/Order');
const Service = require('../models/Service');
const Provider = require('../models/Provider');
const { authenticateToken } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const path = require('path');

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  dest: 'public/uploads/deliverables/',
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|zip|rar/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    if (extname) {
      return cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

// Step 6: Get New Service Requests (Orders)
router.get('/new-requests', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 10, category } = req.query;
    
    let query = {
      providerId: req.user.id,
      status: 'pending'
    };

    if (category && category !== 'all') {
      // Get services in this category
      const services = await Service.find({ 
        providerId: req.user.id, 
        category 
      }).select('_id');
      query.serviceId = { $in: services.map(s => s._id) };
    }

    const orders = await Order.find(query)
      .populate('serviceId', 'title category basePrice')
      .populate('customerId', 'name email profileImage location')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const totalOrders = await Order.countDocuments(query);

    res.json({
      success: true,
      orders: orders.map(order => ({
        id: order._id,
        service: {
          title: order.serviceId?.title,
          category: order.serviceId?.category
        },
        customer: {
          name: order.customerId?.name,
          email: order.customerId?.email,
          profileImage: order.customerId?.profileImage,
          location: order.customerId?.location
        },
        packageType: order.packageType,
        amount: order.amount,
        requirements: order.requirements,
        deadline: order.deadline,
        createdAt: order.createdAt,
        timeRemaining: getTimeRemaining(order.responseDeadline)
      })),
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(totalOrders / limit),
        total: totalOrders
      }
    });

  } catch (error) {
    console.error('New requests error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching new requests'
    });
  }
});

// Step 7: Accept Order
router.post('/:orderId/accept', authenticateToken, [
  body('message').trim().isLength({ min: 10 }).withMessage('Acceptance message must be at least 10 characters'),
  body('estimatedDelivery').isISO8601().withMessage('Valid delivery date is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { orderId } = req.params;
    const { message, estimatedDelivery, customRequirements } = req.body;

    const order = await Order.findOne({ 
      _id: orderId, 
      providerId: req.user.id,
      status: 'pending'
    }).populate('customerId', 'name email');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found or already processed'
      });
    }

    // Update order status
    order.status = 'accepted';
    order.acceptedAt = new Date();
    order.estimatedDelivery = new Date(estimatedDelivery);
    order.providerMessage = message;
    order.customRequirements = customRequirements;

    // Start the project timeline
    order.timeline.push({
      status: 'accepted',
      date: new Date(),
      note: 'Order accepted by provider'
    });

    await order.save();

    // Update provider stats
    const provider = await Provider.findById(req.user.id);
    provider.totalOrders += 1;
    await provider.save();

    // Send notification to customer (implement notification service)
    // await notificationService.sendOrderAccepted(order.customerId._id, order);

    // Emit socket event for real-time update
    req.app.get('io').to(`customer-${order.customerId._id}`).emit('order-accepted', {
      orderId: order._id,
      providerName: provider.name,
      message: message
    });

    res.json({
      success: true,
      message: 'Order accepted successfully',
      order: {
        id: order._id,
        status: order.status,
        estimatedDelivery: order.estimatedDelivery,
        customerName: order.customerId.name
      }
    });

  } catch (error) {
    console.error('Accept order error:', error);
    res.status(500).json({
      success: false,
      message: 'Error accepting order'
    });
  }
});

// Step 7: Decline Order
router.post('/:orderId/decline', authenticateToken, [
  body('reason').trim().isLength({ min: 10 }).withMessage('Decline reason must be at least 10 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { orderId } = req.params;
    const { reason } = req.body;

    const order = await Order.findOne({ 
      _id: orderId, 
      providerId: req.user.id,
      status: 'pending'
    }).populate('customerId', 'name email');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found or already processed'
      });
    }

    order.status = 'declined';
    order.declinedAt = new Date();
    order.declineReason = reason;
    
    order.timeline.push({
      status: 'declined',
      date: new Date(),
      note: `Order declined: ${reason}`
    });

    await order.save();

    // Emit socket event
    req.app.get('io').to(`customer-${order.customerId._id}`).emit('order-declined', {
      orderId: order._id,
      reason: reason
    });

    res.json({
      success: true,
      message: 'Order declined successfully'
    });

  } catch (error) {
    console.error('Decline order error:', error);
    res.status(500).json({
      success: false,
      message: 'Error declining order'
    });
  }
});

// Step 8: Submit Work/Deliverables
router.post('/:orderId/deliver', authenticateToken, upload.array('deliverables', 10), [
  body('deliveryMessage').trim().isLength({ min: 20 }).withMessage('Delivery message must be at least 20 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { orderId } = req.params;
    const { deliveryMessage } = req.body;

    const order = await Order.findOne({ 
      _id: orderId, 
      providerId: req.user.id,
      status: { $in: ['accepted', 'in_progress'] }
    }).populate('customerId', 'name email');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found or not in deliverable state'
      });
    }

    // Process uploaded files
    const deliverables = req.files ? req.files.map(file => ({
      filename: file.originalname,
      path: `/uploads/deliverables/${file.filename}`,
      size: file.size,
      uploadedAt: new Date()
    })) : [];

    // Update order
    order.status = 'delivered';
    order.deliveredAt = new Date();
    order.deliveryMessage = deliveryMessage;
    order.deliverables = deliverables;
    
    order.timeline.push({
      status: 'delivered',
      date: new Date(),
      note: 'Work delivered by provider'
    });

    await order.save();

    // Emit socket event
    req.app.get('io').to(`customer-${order.customerId._id}`).emit('order-delivered', {
      orderId: order._id,
      deliveryMessage: deliveryMessage,
      deliverables: deliverables
    });

    res.json({
      success: true,
      message: 'Work delivered successfully',
      order: {
        id: order._id,
        status: order.status,
        deliveredAt: order.deliveredAt,
        deliverables: deliverables.length
      }
    });

  } catch (error) {
    console.error('Deliver order error:', error);
    res.status(500).json({
      success: false,
      message: 'Error delivering work'
    });
  }
});

// Step 8: Get order details
router.get('/:orderId', authenticateToken, async (req, res) => {
  try {
    const order = await Order.findOne({ 
      _id: req.params.orderId, 
      providerId: req.user.id 
    })
    .populate('serviceId', 'title category packages')
    .populate('customerId', 'name email profileImage location phone');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    res.json({
      success: true,
      order: {
        id: order._id,
        service: order.serviceId,
        customer: order.customerId,
        packageType: order.packageType,
        amount: order.amount,
        netAmount: order.netAmount,
        status: order.status,
        requirements: order.requirements,
        timeline: order.timeline,
        deliverables: order.deliverables,
        createdAt: order.createdAt,
        deadline: order.deadline,
        estimatedDelivery: order.estimatedDelivery
      }
    });

  } catch (error) {
    console.error('Get order details error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching order details'
    });
  }
});

// Get all orders with filtering
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { 
      status = 'all', 
      page = 1, 
      limit = 10, 
      sortBy = 'createdAt', 
      sortOrder = 'desc' 
    } = req.query;

    let query = { providerId: req.user.id };
    
    if (status !== 'all') {
      query.status = status;
    }

    const orders = await Order.find(query)
      .populate('serviceId', 'title category')
      .populate('customerId', 'name email profileImage')
      .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const totalOrders = await Order.countDocuments(query);

    res.json({
      success: true,
      orders: orders.map(order => ({
        id: order._id,
        service: order.serviceId,
        customer: order.customerId,
        amount: order.amount,
        status: order.status,
        createdAt: order.createdAt,
        deadline: order.deadline
      })),
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(totalOrders / limit),
        total: totalOrders
      }
    });

  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching orders'
    });
  }
});

// Helper function to calculate time remaining
function getTimeRemaining(deadline) {
  const now = new Date();
  const end = new Date(deadline);
  const timeDiff = end - now;
  
  if (timeDiff <= 0) {
    return 'Expired';
  }
  
  const hours = Math.floor(timeDiff / (1000 * 60 * 60));
  const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
  
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days} day${days > 1 ? 's' : ''} left`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m left`;
  } else {
    return `${minutes}m left`;
  }
}

module.exports = router;
