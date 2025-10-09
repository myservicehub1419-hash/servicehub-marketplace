const mongoose = require('mongoose');

const portfolioSchema = new mongoose.Schema({
  providerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Provider',
    required: true
  },
  
  // Work samples
  workSamples: [{
    title: {
      type: String,
      required: true
    },
    description: String,
    category: String,
    images: [String],
    projectUrl: String,
    clientName: String,
    completionDate: Date,
    technologies: [String],
    featured: {
      type: Boolean,
      default: false
    }
  }],
  
  // Testimonials
  testimonials: [{
    clientName: {
      type: String,
      required: true
    },
    clientCompany: String,
    testimonial: {
      type: String,
      required: true
    },
    rating: {
      type: Number,
      min: 1,
      max: 5
    },
    projectTitle: String,
    date: {
      type: Date,
      default: Date.now
    },
    verified: {
      type: Boolean,
      default: false
    }
  }],
  
  // Achievements
  achievements: [{
    title: String,
    description: String,
    date: Date,
    category: String // award, certification, milestone
  }]
}, {
  timestamps: true
});

module.exports = mongoose.model('Portfolio', portfolioSchema);
