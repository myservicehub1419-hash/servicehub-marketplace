const express = require('express');
const Provider = require('../models/Provider');
const Order = require('../models/Order');
const Service = require('../models/Service');
const { authenticateToken } = require('../middleware/auth');
const moment = require('moment');

const router = express.Router();

// Step 5: Provider Dashboard
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const provider = await Provider.findById(req.user.id);
    const stats = await provider.getDashboardStats();
    
    // Get recent activities
    const recentOrders = await Order.find({ providerId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('serviceId', 'title')
      .populate('customerId', 'name email');

    // Get monthly earnings chart data
    const monthlyEarnings = await Order.aggregate([
      {
        $match: {
          providerId: provider._id,
          status: 'completed',
          completedAt: {
            $gte: new Date(new Date().getFullYear(), 0, 1) // Current year
          }
        }
      },
      {
        $group: {
          _id: { month: { $month: '$completedAt' } },
          earnings: { $sum: '$netAmount' },
          orders: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.month': 1 }
      }
    ]);

    // Format chart data
    const chartData = Array.from({ length: 12 }, (_, i) => {
      const monthData = monthlyEarnings.find(item => item._id.month === i + 1);
      return {
        month: moment().month(i).format('MMM'),
        earnings: monthData ? monthData.earnings : 0,
        orders: monthData ? monthData.orders : 0
      };
    });

    res.json({
      success: true,
      stats: {
        ...stats,
        recentOrders: recentOrders.map(order => ({
          id: order._id,
          serviceTitle: order.serviceId?.title,
          customerName: order.customerId?.name,
          amount: order.amount,
          status: order.status,
          createdAt: order.createdAt
        })),
        monthlyEarnings: chartData,
        profileCompletion: provider.profileCompletionPercentage
      }
    });

  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching dashboard statistics'
    });
  }
});

// Get provider notifications
router.get('/notifications', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 10, unreadOnly = false } = req.query;
    
    const query = { providerId: req.user.id };
    if (unreadOnly === 'true') {
      query.isRead = false;
    }

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const totalNotifications = await Notification.countDocuments(query);
    const unreadCount = await Notification.countDocuments({ 
      providerId: req.user.id, 
      isRead: false 
    });

    res.json({
      success: true,
      notifications,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(totalNotifications / limit),
        total: totalNotifications
      },
      unreadCount
    });

  } catch (error) {
    console.error('Notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching notifications'
    });
  }
});

// Mark notification as read
router.patch('/notifications/:id/read', authenticateToken, async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, providerId: req.user.id },
      { isRead: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    res.json({
      success: true,
      notification
    });

  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating notification'
    });
  }
});

module.exports = router;
