const express = require('express');
const multer = require('multer');
const path = require('path');
const Provider = require('../models/Provider');
const Portfolio = require('../models/Portfolio');
const { authenticateToken } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/uploads/portfolio/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images and documents are allowed.'));
    }
  }
});

// Step 4: Complete Profile Setup
router.post('/profile-setup', authenticateToken, [
  body('businessName').trim().isLength({ min: 2 }).withMessage('Business name is required'),
  body('experienceLevel').isIn(['fresher', '1-3_years', '3-5_years', '5-10_years', '10+_years']).withMessage('Invalid experience level'),
  body('description').trim().isLength({ min: 50 }).withMessage('Description must be at least 50 characters'),
  body('skills').isArray({ min: 3 }).withMessage('At least 3 skills are required'),
  body('hourlyRate').isNumeric().withMessage('Valid hourly rate is required'),
  body('location.city').trim().notEmpty().withMessage('City is required'),
  body('location.state').trim().notEmpty().withMessage('State is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const provider = await Provider.findById(req.user.id);
    if (!provider) {
      return res.status(404).json({
        success: false,
        message: 'Provider not found'
      });
    }

    const {
      businessName,
      experienceLevel,
      description,
      skills,
      languages,
      hourlyRate,
      location,
      availability
    } = req.body;

    // Update profile setup
    provider.profileSetup.basicInfo = {
      ...provider.profileSetup.basicInfo,
      businessName,
      experienceLevel,
      description,
      skills: Array.isArray(skills) ? skills : skills.split(',').map(s => s.trim()),
      languages: Array.isArray(languages) ? languages : (languages ? languages.split(',').map(l => l.trim()) : []),
      location,
      hourlyRate: parseFloat(hourlyRate),
      availability
    };

    provider.profileSetup.completed = true;
    provider.onboardingStep = Math.max(provider.onboardingStep, 4);
    provider.calculateProfileCompletion();

    await provider.save();

    res.json({
      success: true,
      message: 'Profile setup completed successfully',
      profileCompletion: provider.profileCompletionPercentage,
      nextStep: '/provider/portfolio-setup'
    });

  } catch (error) {
    console.error('Profile setup error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating profile'
    });
  }
});

// Step 4: Add Work Experience
router.post('/work-experience', authenticateToken, [
  body('company').trim().notEmpty().withMessage('Company name is required'),
  body('position').trim().notEmpty().withMessage('Position is required'),
  body('startDate').isISO8601().withMessage('Valid start date is required'),
  body('description').trim().isLength({ min: 20 }).withMessage('Description must be at least 20 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const provider = await Provider.findById(req.user.id);
    const { company, position, startDate, endDate, current, description } = req.body;

    const experience = {
      company,
      position,
      startDate: new Date(startDate),
      endDate: current ? null : new Date(endDate),
      current: current || false,
      description,
      duration: calculateDuration(new Date(startDate), current ? new Date() : new Date(endDate))
    };

    provider.workExperience.push(experience);
    provider.calculateProfileCompletion();
    await provider.save();

    res.json({
      success: true,
      message: 'Work experience added successfully',
      experience,
      profileCompletion: provider.profileCompletionPercentage
    });

  } catch (error) {
    console.error('Work experience error:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding work experience'
    });
  }
});

// Step 4: Add Education
router.post('/education', authenticateToken, [
  body('institution').trim().notEmpty().withMessage('Institution name is required'),
  body('degree').trim().notEmpty().withMessage('Degree is required'),
  body('field').trim().notEmpty().withMessage('Field of study is required'),
  body('year').isInt({ min: 1990, max: new Date().getFullYear() }).withMessage('Valid graduation year is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const provider = await Provider.findById(req.user.id);
    const { institution, degree, field, year, grade } = req.body;

    const education = {
      institution,
      degree,
      field,
      year: parseInt(year),
      grade
    };

    provider.education.push(education);
    provider.calculateProfileCompletion();
    await provider.save();

    res.json({
      success: true,
      message: 'Education added successfully',
      education,
      profileCompletion: provider.profileCompletionPercentage
    });

  } catch (error) {
    console.error('Education error:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding education'
    });
  }
});

// Step 4: Portfolio Setup - Add Work Sample
router.post('/portfolio/work-sample', authenticateToken, upload.array('images', 5), [
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('description').trim().isLength({ min: 20 }).withMessage('Description must be at least 20 characters'),
  body('category').trim().notEmpty().withMessage('Category is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { title, description, category, projectUrl, clientName, technologies, completionDate } = req.body;
    
    // Get uploaded file paths
    const images = req.files ? req.files.map(file => `/uploads/portfolio/${file.filename}`) : [];

    // Find or create portfolio
    let portfolio = await Portfolio.findOne({ providerId: req.user.id });
    if (!portfolio) {
      portfolio = new Portfolio({ providerId: req.user.id, workSamples: [], testimonials: [] });
    }

    const workSample = {
      title,
      description,
      category,
      images,
      projectUrl,
      clientName,
      completionDate: completionDate ? new Date(completionDate) : new Date(),
      technologies: technologies ? technologies.split(',').map(t => t.trim()) : [],
      featured: portfolio.workSamples.length === 0 // Make first sample featured
    };

    portfolio.workSamples.push(workSample);
    await portfolio.save();

    // Update provider's portfolio completion
    const provider = await Provider.findById(req.user.id);
    provider.calculateProfileCompletion();
    await provider.save();

    res.json({
      success: true,
      message: 'Work sample added successfully',
      workSample,
      profileCompletion: provider.profileCompletionPercentage
    });

  } catch (error) {
    console.error('Portfolio error:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding work sample'
    });
  }
});

// Step 4: Add Testimonial
router.post('/portfolio/testimonial', authenticateToken, [
  body('clientName').trim().notEmpty().withMessage('Client name is required'),
  body('testimonial').trim().isLength({ min: 20 }).withMessage('Testimonial must be at least 20 characters'),
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
  body('projectTitle').trim().notEmpty().withMessage('Project title is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { clientName, clientCompany, testimonial, rating, projectTitle } = req.body;

    // Find or create portfolio
    let portfolio = await Portfolio.findOne({ providerId: req.user.id });
    if (!portfolio) {
      portfolio = new Portfolio({ providerId: req.user.id, workSamples: [], testimonials: [] });
    }

    const testimonialData = {
      clientName,
      clientCompany,
      testimonial,
      rating: parseInt(rating),
      projectTitle,
      date: new Date(),
      verified: false // Will be verified later
    };

    portfolio.testimonials.push(testimonialData);
    await portfolio.save();

    // Update provider profile completion
    const provider = await Provider.findById(req.user.id);
    provider.calculateProfileCompletion();
    
    // If profile is complete enough, activate account
    if (provider.profileCompletionPercentage >= 80 && provider.subscriptionStatus === 'active') {
      provider.accountStatus = 'active';
      provider.profileVisibility = true;
      provider.onboardingStep = 5; // Completed
    }
    
    await provider.save();

    res.json({
      success: true,
      message: 'Testimonial added successfully',
      testimonial: testimonialData,
      profileCompletion: provider.profileCompletionPercentage,
      canGoLive: provider.canGoLive()
    });

  } catch (error) {
    console.error('Testimonial error:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding testimonial'
    });
  }
});

// Go Live - Activate Provider Profile
router.post('/go-live', authenticateToken, async (req, res) => {
  try {
    const provider = await Provider.findById(req.user.id);
    
    if (!provider.canGoLive()) {
      return res.status(400).json({
        success: false,
        message: 'Profile not ready to go live. Complete your profile and ensure active subscription.',
        requirements: {
          profileCompletion: provider.profileCompletionPercentage >= 80,
          activeSubscription: provider.subscriptionStatus === 'active',
          accountVerified: provider.accountStatus !== 'suspended'
        }
      });
    }

    provider.accountStatus = 'active';
    provider.profileVisibility = true;
    provider.onboardingStep = 5;
    provider.onlineStatus = 'online';
    
    await provider.save();

    res.json({
      success: true,
      message: 'Congratulations! Your provider profile is now live and visible to customers.',
      provider: {
        id: provider._id,
        name: provider.name,
        businessName: provider.profileSetup.basicInfo.businessName,
        category: provider.profileSetup.basicInfo.category,
        profileCompletion: provider.profileCompletionPercentage,
        accountStatus: provider.accountStatus
      },
      nextStep: '/provider/dashboard'
    });

  } catch (error) {
    console.error('Go live error:', error);
    res.status(500).json({
      success: false,
      message: 'Error activating profile'
    });
  }
});

// Helper function to calculate work duration
function calculateDuration(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = Math.abs(end - start);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  const years = Math.floor(diffDays / 365);
  const months = Math.floor((diffDays % 365) / 30);
  
  if (years > 0) {
    return `${years} year${years > 1 ? 's' : ''} ${months > 0 ? `${months} month${months > 1 ? 's' : ''}` : ''}`;
  } else {
    return `${months} month${months > 1 ? 's' : ''}`;
  }
}

module.exports = router;
