class ProviderPortal {
    constructor() {
        this.currentView = 'dashboard';
        this.selectedPlan = null;
        this.stripe = null;
        this.initStripe();
    }

    // Initialize Stripe
    async initStripe() {
        if (window.Stripe && STRIPE_CONFIG.PUBLISHABLE_KEY) {
            this.stripe = Stripe(STRIPE_CONFIG.PUBLISHABLE_KEY);
        }
    }

    // Step 1: Check if provider needs to complete onboarding steps
    async checkOnboardingStatus() {
        try {
            const response = await axios.get(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.PROVIDER_DASHBOARD}`);
            
            if (response.data.success) {
                const user = authService.getUser();
                
                // Check onboarding steps
                if (!user.providerInfo?.subscriptionPlan) {
                    this.showPremiumPlansPage();
                    return false;
                } else if (!user.providerInfo?.profileCompleted) {
                    this.showAccountSetupPage();
                    return false;
                } else if (!user.isApproved) {
                    this.showPendingApprovalPage();
                    return false;
                }
                
                return true; // All steps completed
            }
        } catch (error) {
            console.error('Onboarding check error:', error);
            return false;
        }
    }

    // Step 3: Show premium plans page
    async showPremiumPlansPage() {
        try {
            const response = await axios.get(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.GET_PREMIUM_PLANS}`);
            
            if (response.data.success) {
                this.renderPremiumPlans(response.data.data.plans);
            }
        } catch (error) {
            authService.showNotification('Failed to load premium plans', 'error');
            console.error('Premium plans error:', error);
        }
    }

    // Render premium plans
    renderPremiumPlans(plans) {
        const container = document.getElementById('main-content') || document.body;
        
        container.innerHTML = `
            <div class="premium-plans-page">
                <div class="plans-header">
                    <h1>Choose Your Premium Plan</h1>
                    <p>Select a plan that best fits your business needs</p>
                </div>
                
                <div class="plans-container">
                    ${plans.map(plan => this.createPlanCard(plan)).join('')}
                </div>
                
                <div class="plans-footer">
                    <p>All plans include secure payments, customer support, and analytics</p>
                    <small>Prices are in INR and billed monthly</small>
                </div>
            </div>
        `;
    }

    // Create plan card HTML
    createPlanCard(plan) {
        return `
            <div class="plan-card ${plan.popular ? 'popular' : ''}" data-plan="${plan.id}">
                ${plan.popular ? '<div class="popular-badge">Most Popular</div>' : ''}
                
                <div class="plan-header">
                    <h3>${plan.name}</h3>
                    <div class="plan-price">
                        <span class="currency">₹</span>
                        <span class="amount">${plan.price.toLocaleString()}</span>
                        <span class="period">/month</span>
                    </div>
                </div>
                
                <div class="plan-features">
                    <ul>
                        ${plan.features.map(feature => `<li><i class="fas fa-check"></i>${feature}</li>`).join('')}
                    </ul>
                </div>
                
                <div class="plan-actions">
                    <button class="btn ${plan.popular ? 'btn-primary' : 'btn-outline'}" 
                            onclick="providerPortal.selectPlan('${plan.id}', ${plan.price})">
                        ${plan.popular ? 'Get Started' : 'Choose Plan'}
                    </button>
                </div>
                
                <div class="plan-limits">
                    <small>
                        ${plan.limits.maxServices === -1 ? 'Unlimited' : plan.limits.maxServices} Services • 
                        ${plan.limits.maxImages === -1 ? 'Unlimited' : plan.limits.maxImages} Images • 
                        ${plan.features.includes('Priority support') ? 'Priority' : 'Standard'} Support
                    </small>
                </div>
            </div>
        `;
    }

    // Step 3: Select and subscribe to plan
    async selectPlan(planId, price) {
        try {
            this.selectedPlan = { id: planId, price };
            
            // Create payment intent for subscription
            const response = await axios.post(
                `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.SUBSCRIBE_PLAN}`,
                { planId }
            );

            if (response.data.success) {
                await this.processSubscriptionPayment(response.data.data);
            }
        } catch (error) {
            authService.showNotification('Plan selection failed', 'error');
            console.error('Plan selection error:', error);
        }
    }

    // Process subscription payment
    async processSubscriptionPayment(paymentData) {
        try {
            if (!this.stripe) {
                throw new Error('Stripe not initialized');
            }

            // Show payment modal
            this.showPaymentModal(paymentData);

        } catch (error) {
            authService.showNotification('Payment processing failed', 'error');
            console.error('Subscription payment error:', error);
        }
    }

    // Show payment modal for subscription
    showPaymentModal(paymentData) {
        const modal = document.createElement('div');
        modal.className = 'modal payment-modal';
        modal.id = 'payment-modal';
        
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Complete Payment</h2>
                    <span class="modal-close" onclick="providerPortal.closePaymentModal()">&times;</span>
                </div>
                <div class="modal-body">
                    <div class="payment-summary">
                        <h3>Plan: ${this.selectedPlan.id.charAt(0).toUpperCase() + this.selectedPlan.id.slice(1)}</h3>
                        <div class="amount">₹${this.selectedPlan.price.toLocaleString()}/month</div>
                    </div>
                    
                    <form id="payment-form">
                        <div id="card-element">
                            <!-- Stripe card element will be mounted here -->
                        </div>
                        <div id="card-errors" role="alert"></div>
                        
                        <button type="submit" id="submit-payment" class="btn btn-primary">
                            <span id="button-text">Pay ₹${this.selectedPlan.price.toLocaleString()}</span>
                            <div id="spinner" class="spinner hidden"></div>
                        </button>
                    </form>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Initialize Stripe elements
        this.setupStripePayment(paymentData.clientSecret);
        
        setTimeout(() => modal.style.display = 'flex', 10);
    }

    // Setup Stripe payment form
    setupStripePayment(clientSecret) {
        const elements = this.stripe.elements();
        const cardElement = elements.create('card', {
            style: {
                base: {
                    fontSize: '16px',
                    color: '#424770',
                    '::placeholder': {
                        color: '#aab7c4',
                    },
                },
            },
        });

        cardElement.mount('#card-element');

        // Handle form submission
        const form = document.getElementById('payment-form');
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            await this.handlePaymentSubmission(clientSecret, cardElement);
        });

        // Handle card errors
        cardElement.on('change', ({error}) => {
            const displayError = document.getElementById('card-errors');
            if (error) {
                displayError.textContent = error.message;
            } else {
                displayError.textContent = '';
            }
        });
    }

    // Handle payment submission
    async handlePaymentSubmission(clientSecret, cardElement) {
        const submitButton = document.getElementById('submit-payment');
        const buttonText = document.getElementById('button-text');
        const spinner = document.getElementById('spinner');

        submitButton.disabled = true;
        buttonText.style.display = 'none';
        spinner.classList.remove('hidden');

        try {
            const {error, paymentIntent} = await this.stripe.confirmCardPayment(clientSecret, {
                payment_method: {
                    card: cardElement,
                    billing_details: {
                        name: `${authService.getUser().firstName} ${authService.getUser().lastName}`,
                        email: authService.getUser().email
                    }
                }
            });

            if (error) {
                throw error;
            }

            if (paymentIntent.status === 'succeeded') {
                authService.showNotification('Payment successful! Welcome to Premium!', 'success');
                this.closePaymentModal();
                
                // Proceed to account setup
                setTimeout(() => this.showAccountSetupPage(), 2000);
            }

        } catch (error) {
            authService.showNotification(error.message || 'Payment failed', 'error');
            console.error('Payment error:', error);
        } finally {
            submitButton.disabled = false;
            buttonText.style.display = 'inline';
            spinner.classList.add('hidden');
        }
    }

    // Close payment modal
    closePaymentModal() {
        const modal = document.getElementById('payment-modal');
        if (modal) {
            modal.remove();
        }
    }

    // Step 4: Show account setup page
    showAccountSetupPage() {
        const container = document.getElementById('main-content') || document.body;
        
        container.innerHTML = `
            <div class="account-setup-page">
                <div class="setup-header">
                    <h1>Complete Your Profile</h1>
                    <p>Set up your professional profile to start receiving orders</p>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: 50%"></div>
                    </div>
                </div>
                
                <form id="account-setup-form" class="setup-form">
                    <div class="form-section">
                        <h3>Business Information</h3>
                        <div class="form-row">
                            <div class="form-group">
                                <label for="businessName">Business Name *</label>
                                <input type="text" id="businessName" name="businessName" required maxlength="100" />
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label for="description">Business Description *</label>
                            <textarea id="description" name="description" required maxlength="1000" 
                                    placeholder="Describe your services, expertise, and what makes you unique..."></textarea>
                        </div>
                    </div>
                    
                    <div class="form-section">
                        <h3>Skills & Experience</h3>
                        <div class="form-group">
                            <label for="skills">Skills (comma separated)</label>
                            <input type="text" id="skills" name="skills" 
                                   placeholder="Web Development, UI/UX Design, JavaScript..." />
                        </div>
                        
                        <div class="form-group">
                            <label for="experience">Years of Experience *</label>
                            <select id="experience" name="experience" required>
                                <option value="">Select experience</option>
                                <option value="0-1">Less than 1 year</option>
                                <option value="1-3">1-3 years</option>
                                <option value="3-5">3-5 years</option>
                                <option value="5-10">5-10 years</option>
                                <option value="10+">10+ years</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="form-section">
                        <h3>Portfolio</h3>
                        <div id="portfolio-items">
                            <div class="portfolio-item">
                                <div class="form-row">
                                    <div class="form-group">
                                        <label>Project Title</label>
                                        <input type="text" name="portfolio[0][title]" placeholder="Project name" />
                                    </div>
                                    <div class="form-group">
                                        <label>Project URL</label>
                                        <input type="url" name="portfolio[0][url]" placeholder="https://..." />
                                    </div>
                                </div>
                                <div class="form-group">
                                    <label>Description</label>
                                    <textarea name="portfolio[0][description]" placeholder="Brief project description"></textarea>
                                </div>
                            </div>
                        </div>
                        <button type="button" class="btn btn-outline" onclick="providerPortal.addPortfolioItem()">
                            Add Another Project
                        </button>
                    </div>
                    
                    <div class="form-section">
                        <h3>Work Preferences</h3>
                        <div class="form-row">
                            <div class="form-group">
                                <label for="workingHours">Working Hours</label>
                                <input type="text" id="workingHours" name="workingHours" 
                                       placeholder="e.g., 9 AM - 6 PM IST" />
                            </div>
                            <div class="form-group">
                                <label for="responseTime">Typical Response Time</label>
                                <select id="responseTime" name="responseTime">
                                    <option value="1 hour">Within 1 hour</option>
                                    <option value="2 hours" selected>Within 2 hours</option>
                                    <option value="6 hours">Within 6 hours</option>
                                    <option value="24 hours">Within 24 hours</option>
                                </select>
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label for="languages">Languages (comma separated)</label>
                            <input type="text" id="languages" name="languages" value="English" 
                                   placeholder="English, Hindi, etc." />
                        </div>
                    </div>
                    
                    <div class="form-actions">
                        <button type="submit" class="btn btn-primary">Complete Profile Setup</button>
                    </div>
                </form>
            </div>
        `;

        // Handle form submission
        document.getElementById('account-setup-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.submitAccountSetup();
        });
    }

    // Add portfolio item
    addPortfolioItem() {
        const container = document.getElementById('portfolio-items');
        const itemCount = container.children.length;
        
        if (itemCount >= 5) {
            authService.showNotification('Maximum 5 portfolio items allowed', 'warning');
            return;
        }
        
        const portfolioItem = document.createElement('div');
        portfolioItem.className = 'portfolio-item';
        portfolioItem.innerHTML = `
            <div class="form-row">
                <div class="form-group">
                    <label>Project Title</label>
                    <input type="text" name="portfolio[${itemCount}][title]" placeholder="Project name" />
                </div>
                <div class="form-group">
                    <label>Project URL</label>
                    <input type="url" name="portfolio[${itemCount}][url]" placeholder="https://..." />
                </div>
                <button type="button" class="btn btn-sm btn-danger" onclick="this.closest('.portfolio-item').remove()">
                    Remove
                </button>
            </div>
            <div class="form-group">
                <label>Description</label>
                <textarea name="portfolio[${itemCount}][description]" placeholder="Brief project description"></textarea>
            </div>
        `;
        
        container.appendChild(portfolioItem);
    }

    // Submit account setup
    async submitAccountSetup() {
        try {
            const form = document.getElementById('account-setup-form');
            const formData = new FormData(form);
            
            // Convert form data to proper format
            const setupData = {
                businessName: formData.get('businessName'),
                description: formData.get('description'),
                skills: formData.get('skills') ? formData.get('skills').split(',').map(s => s.trim()) : [],
                experience: formData.get('experience'),
                workingHours: formData.get('workingHours'),
                responseTime: formData.get('responseTime'),
                languages: formData.get('languages') ? formData.get('languages').split(',').map(s => s.trim()) : ['English'],
                portfolio: []
            };

            // Extract portfolio items
            const portfolioTitles = formData.getAll('portfolio[][title]');
            const portfolioUrls = formData.getAll('portfolio[][url]');
            const portfolioDescriptions = formData.getAll('portfolio[][description]');
            
            for (let i = 0; i < portfolioTitles.length; i++) {
                if (portfolioTitles[i]) {
                    setupData.portfolio.push({
                        title: portfolioTitles[i],
                        url: portfolioUrls[i],
                        description: portfolioDescriptions[i]
                    });
                }
            }

            this.showLoader('account-setup-form');

            const response = await axios.post(
                `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.SETUP_ACCOUNT}`,
                setupData
            );

            if (response.data.success) {
                authService.showNotification('Profile setup completed successfully!', 'success');
                
                // Update user data
                authService.user = response.data.data.provider;
                localStorage.setItem('user', JSON.stringify(authService.user));
                
                // Show pending approval message
                setTimeout(() => this.showPendingApprovalPage(), 2000);
            }

        } catch (error) {
            authService.showNotification('Profile setup failed', 'error');
            console.error('Account setup error:', error);
        } finally {
            this.hideLoader();
        }
    }

    // Show pending approval page
    showPendingApprovalPage() {
        const container = document.getElementById('main-content') || document.body;
        
        container.innerHTML = `
            <div class="pending-approval-page">
                <div class="approval-card">
                    <div class="approval-icon">
                        <i class="fas fa-clock"></i>
                    </div>
                    <h1>Profile Under Review</h1>
                    <p>Thank you for completing your profile setup! Our team is currently reviewing your application.</p>
                    
                    <div class="review-info">
                        <h3>What happens next?</h3>
                        <ul>
                            <li><i class="fas fa-check"></i> Profile review (1-2 business days)</li>
                            <li><i class="fas fa-check"></i> Verification of credentials</li>
                            <li><i class="fas fa-check"></i> Email notification upon approval</li>
                            <li><i class="fas fa-check"></i> Access to full provider dashboard</li>
                        </ul>
                    </div>
                    
                    <div class="contact-support">
                        <p>Questions? <a href="mailto:support@servicehub.com">Contact our support team</a></p>
                    </div>
                    
                    <button class="btn btn-outline" onclick="providerPortal.refreshApprovalStatus()">
                        Check Status
                    </button>
                </div>
            </div>
        `;
    }

    // Refresh approval status
    async refreshApprovalStatus() {
        try {
            const response = await authService.getProfile();
            
            if (response.success && response.data.isApproved) {
                authService.showNotification('Congratulations! Your profile has been approved!', 'success');
                setTimeout(() => this.loadDashboard(), 2000);
            } else {
                authService.showNotification('Your profile is still under review', 'info');
            }
        } catch (error) {
            authService.showNotification('Failed to check status', 'error');
        }
    }

    // Step 5: Load provider dashboard
    async loadDashboard() {
        try {
            this.showLoader('main-content');
            
            const response = await axios.get(
                `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.PROVIDER_DASHBOARD}`
            );

            if (response.data.success) {
                this.renderDashboard(response.data.data);
            }
        } catch (error) {
            authService.showNotification('Failed to load dashboard', 'error');
            console.error('Dashboard error:', error);
        } finally {
            this.hideLoader();
        }
    }

    // Render provider dashboard
    renderDashboard(data) {
        const container = document.getElementById('main-content') || document.body;
        
        container.innerHTML = `
            <div class="provider-dashboard">
                <div class="dashboard-header">
                    <h1>Provider Dashboard</h1>
                    <p>Welcome back, ${authService.getUser().firstName}!</p>
                </div>
                
                <div class="dashboard-stats">
                    ${this.createStatsCards(data.stats)}
                </div>
                
                <div class="dashboard-content">
                    <div class="quick-actions">
                        <h3>Quick Actions</h3>
                        <div class="actions-grid">
                            ${data.quickActions.map(action => this.createQuickActionCard(action)).join('')}
                        </div>
                    </div>
                    
                    <div class="dashboard-sections">
                        <div class="dashboard-nav">
                            <button class="nav-btn active" onclick="providerPortal.showSection('orders')">
                                Orders <span class="badge">${data.stats.pendingOrders}</span>
                            </button>
                            <button class="nav-btn" onclick="providerPortal.showSection('services')">Services</button>
                            <button class="nav-btn" onclick="providerPortal.showSection('earnings')">Earnings</button>
                            <button class="nav-btn" onclick="providerPortal.showSection('analytics')">Analytics</button>
                            <button class="nav-btn" onclick="providerPortal.showSection('profile')">Profile</button>
                        </div>
                        
                        <div id="dashboard-section-content">
                            <!-- Section content will be loaded here -->
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Load default section (orders)
        this.showSection('orders');
    }

    // Create stats cards
    createStatsCards(stats) {
        return `
            <div class="stat-card">
                <div class="stat-icon"><i class="fas fa-briefcase"></i></div>
                <div class="stat-info">
                    <div class="stat-value">${stats.totalServices}</div>
                    <div class="stat-label">Total Services</div>
                </div>
            </div>
            <div class="stat-card pending">
                <div class="stat-icon"><i class="fas fa-clock"></i></div>
                <div class="stat-info">
                    <div class="stat-value">${stats.pendingOrders}</div>
                    <div class="stat-label">Pending Orders</div>
                </div>
            </div>
            <div class="stat-card active">
                <div class="stat-icon"><i class="fas fa-play-circle"></i></div>
                <div class="stat-info">
                    <div class="stat-value">${stats.activeOrders}</div>
                    <div class="stat-label">Active Projects</div>
                </div>
            </div>
            <div class="stat-card completed">
                <div class="stat-icon"><i class="fas fa-check-circle"></i></div>
                <div class="stat-info">
                    <div class="stat-value">${stats.completedOrders}</div>
                    <div class="stat-label">Completed</div>
                </div>
            </div>
            <div class="stat-card earnings">
                <div class="stat-icon"><i class="fas fa-rupee-sign"></i></div>
                <div class="stat-info">
                    <div class="stat-value">₹${stats.monthlyEarnings.toLocaleString()}</div>
                    <div class="stat-label">This Month</div>
                </div>
            </div>
            <div class="stat-card messages">
                <div class="stat-icon"><i class="fas fa-envelope"></i></div>
                <div class="stat-info">
                    <div class="stat-value">${stats.newMessages}</div>
                    <div class="stat-label">New Messages</div>
                </div>
            </div>
        `;
    }

    // Create quick action card
    createQuickActionCard(action) {
        return `
            <div class="quick-action-card" onclick="window.location.href='${action.link}'">
                <h4>${action.title}</h4>
                <p>${action.description}</p>
                ${action.badge ? `<span class="action-badge">${action.badge}</span>` : ''}
            </div>
        `;
    }

    // Step 6: Show different dashboard sections
    async showSection(sectionName) {
        // Update active nav
        document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
        event.target.classList.add('active');
        
        const contentContainer = document.getElementById('dashboard-section-content');
        this.showLoader('dashboard-section-content');
        
        try {
            switch (sectionName) {
                case 'orders':
                    await this.loadOrdersSection(contentContainer);
                    break;
                case 'services':
                    await this.loadServicesSection(contentContainer);
                    break;
                case 'earnings':
                    await this.loadEarningsSection(contentContainer);
                    break;
                case 'analytics':
                    await this.loadAnalyticsSection(contentContainer);
                    break;
                case 'profile':
                    await this.loadProfileSection(contentContainer);
                    break;
            }
        } catch (error) {
            console.error(`Failed to load ${sectionName} section:`, error);
            authService.showNotification(`Failed to load ${sectionName}`, 'error');
        } finally {
            this.hideLoader();
        }
    }

    // Step 6: Load orders section (new service requests)
    async loadOrdersSection(container) {
        try {
            const response = await axios.get(
                `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.GET_SERVICE_REQUESTS}?page=1&limit=10`
            );

            if (response.data.success) {
                container.innerHTML = this.renderOrdersSection(response.data.data);
            }
        } catch (error) {
            throw error;
        }
    }

    // Render orders section
    renderOrdersSection(data) {
        if (data.requests.length === 0) {
            return `
                <div class="no-orders">
                    <div class="no-orders-icon">
                        <i class="fas fa-inbox"></i>
                    </div>
                    <h3>No pending orders</h3>
                    <p>New service requests will appear here</p>
                </div>
            `;
        }

        return `
            <div class="orders-section">
                <div class="section-header">
                    <h3>Service Requests</h3>
                    <div class="orders-filters">
                        <select onchange="providerPortal.filterOrders(this.value)">
                            <option value="all">All Requests</option>
                            <option value="pending">Pending</option>
                            <option value="accepted">Accepted</option>
                            <option value="in_progress">In Progress</option>
                        </select>
                    </div>
                </div>
                
                <div class="orders-list">
                    ${data.requests.map(request => this.createOrderCard(request)).join('')}
                </div>
                
                ${this.createPagination(data.pagination)}
            </div>
        `;
    }

    // Create order card
    createOrderCard(request) {
        return `
            <div class="order-card">
                <div class="order-header">
                    <div class="customer-info">
                        <img src="${request.customer.avatar || '/images/default-avatar.jpg'}" alt="${request.customer.name}" class="customer-avatar" />
                        <div class="customer-details">
                            <h4>${request.customer.name}</h4>
                            <p>${request.customer.email}</p>
                            <p>${request.customer.phone}</p>
                        </div>
                    </div>
                    <div class="order-meta">
                        <span class="booking-id">ID: ${request.bookingId}</span>
                        <span class="order-date">${new Date(request.createdAt).toLocaleDateString()}</span>
                    </div>
                </div>
                
                <div class="order-content">
                    <h3>${request.project.title}</h3>
                    <p class="service-title">Service: ${request.service.title}</p>
                    <p class="package-info">Package: ${request.package.name}</p>
                    
                    <div class="project-description">
                        <h4>Project Description</h4>
                        <p>${request.project.description}</p>
                    </div>
                    
                    ${request.project.requirements ? `
                        <div class="project-requirements">
                            <h4>Requirements</h4>
                            <p>${request.project.requirements}</p>
                        </div>
                    ` : ''}
                    
                    ${request.attachments && request.attachments.length > 0 ? `
                        <div class="project-attachments">
                            <h4>Attachments</h4>
                            <div class="attachment-list">
                                ${request.attachments.map(file => `
                                    <a href="${file.url}" target="_blank" class="attachment-link">
                                        <i class="fas fa-paperclip"></i> ${file.filename}
                                    </a>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                </div>
                
                <div class="order-footer">
                    <div class="order-pricing">
                        <div class="price-item">
                            <span>Total Amount:</span>
                            <strong>₹${request.totalAmount.toLocaleString()}</strong>
                        </div>
                        <div class="price-item earnings">
                            <span>Your Earnings:</span>
                            <strong>₹${request.providerEarnings.toLocaleString()}</strong>
                        </div>
                    </div>
                    
                    <div class="order-actions">
                        <button class="btn btn-outline" onclick="providerPortal.showOrderDetails('${request._id}')">
                            View Details
                        </button>
                        <button class="btn btn-primary" onclick="providerPortal.acceptOrder('${request._id}')">
                            Accept Order
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    // Step 7: Accept order
    async acceptOrder(bookingId) {
        try {
            // Show acceptance modal
            this.showAcceptOrderModal(bookingId);
        } catch (error) {
            authService.showNotification('Failed to accept order', 'error');
            console.error('Accept order error:', error);
        }
    }

    // Show accept order modal
    showAcceptOrderModal(bookingId) {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'accept-order-modal';
        
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Accept Service Request</h2>
                    <span class="modal-close" onclick="providerPortal.closeModal('accept-order-modal')">&times;</span>
                </div>
                <div class="modal-body">
                    <form id="accept-order-form">
                        <div class="form-group">
                            <label for="acceptMessage">Message to Customer *</label>
                            <textarea id="acceptMessage" name="message" required maxlength="500" 
                                    placeholder="Thank you for choosing me! I'll start working on your project and deliver high-quality results..."></textarea>
                        </div>
                        
                        <div class="form-group">
                            <label for="estimatedDelivery">Estimated Delivery Date</label>
                            <input type="date" id="estimatedDelivery" name="estimatedDelivery" 
                                   min="${new Date().toISOString().split('T')[0]}" />
                        </div>
                        
                        <div class="acceptance-terms">
                            <p><strong>By accepting this order:</strong></p>
                            <ul>
                                <li>You commit to delivering the project as described</li>
                                <li>Payment will be released upon successful completion</li>
                                <li>You agree to maintain professional communication</li>
                            </ul>
                        </div>
                        
                        <div class="form-actions">
                            <button type="button" class="btn btn-secondary" onclick="providerPortal.closeModal('accept-order-modal')">
                                Cancel
                            </button>
                            <button type="submit" class="btn btn-primary">
                                Accept Order
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Handle form submission
        document.getElementById('accept-order-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.submitOrderAcceptance(bookingId);
        });
        
        setTimeout(() => modal.style.display = 'flex', 10);
    }

    // Submit order acceptance
    async submitOrderAcceptance(bookingId) {
        try {
            const form = document.getElementById('accept-order-form');
            const formData = new FormData(form);
            
            const acceptanceData = {
                message: formData.get('message'),
                estimatedDelivery: formData.get('estimatedDelivery') || null
            };

            this.showLoader('accept-order-form');

            const response = await axios.post(
                `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.ACCEPT_REQUEST.replace(':id', bookingId)}`,
                acceptanceData
            );

            if (response.data.success) {
                authService.showNotification('Order accepted successfully! Customer will be notified.', 'success');
                this.closeModal('accept-order-modal');
                
                // Refresh orders section
                setTimeout(() => this.showSection('orders'), 2000);
            }

        } catch (error) {
            authService.showNotification('Failed to accept order', 'error');
            console.error('Order acceptance error:', error);
        } finally {
            this.hideLoader();
        }
    }

    // Step 8: Complete job and mark as delivered
    async completeJob(bookingId) {
        this.showCompleteJobModal(bookingId);
    }

    // Show complete job modal
    showCompleteJobModal(bookingId) {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'complete-job-modal';
        
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Complete Job</h2>
                    <span class="modal-close" onclick="providerPortal.closeModal('complete-job-modal')">&times;</span>
                </div>
                <div class="modal-body">
                    <form id="complete-job-form">
                        <div class="form-group">
                            <label for="completionMessage">Completion Message *</label>
                            <textarea id="completionMessage" name="completionMessage" required maxlength="500" 
                                    placeholder="Your project has been completed successfully! Please review the deliverables..."></textarea>
                        </div>
                        
                        <div class="form-group">
                            <label for="deliverables">Upload Deliverables</label>
                            <input type="file" id="deliverables" name="deliverables" multiple 
                                   accept=".pdf,.doc,.docx,.zip,.rar,.jpg,.jpeg,.png,.gif" />
                            <small>Upload final files, documents, or deliverables for the customer</small>
                        </div>
                        
                        <div class="completion-checklist">
                            <h4>Completion Checklist:</h4>
                            <label><input type="checkbox" required> All project requirements completed</label>
                            <label><input type="checkbox" required> Quality checked and approved</label>
                            <label><input type="checkbox" required> All files ready for delivery</label>
                            <label><input type="checkbox" required> Customer will be notified for final payment</label>
                        </div>
                        
                        <div class="form-actions">
                            <button type="button" class="btn btn-secondary" onclick="providerPortal.closeModal('complete-job-modal')">
                                Cancel
                            </button>
                            <button type="submit" class="btn btn-success">
                                Mark as Completed
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Handle form submission
        document.getElementById('complete-job-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.submitJobCompletion(bookingId);
        });
        
        setTimeout(() => modal.style.display = 'flex', 10);
    }

    // Submit job completion
    async submitJobCompletion(bookingId) {
        try {
            const form = document.getElementById('complete-job-form');
            const formData = new FormData(form);
            
            // Handle file uploads if any
            const files = formData.getAll('deliverables');
            let deliverables = [];
            
            if (files.length > 0 && files[0].name) {
                // Upload files first
                const uploadResponse = await this.uploadDeliverables(bookingId, files);
                if (uploadResponse.success) {
                    deliverables = uploadResponse.data.deliverables;
                }
            }
            
            const completionData = {
                completionMessage: formData.get('completionMessage'),
                deliverables: deliverables
            };

            this.showLoader('complete-job-form');

            const response = await axios.post(
                `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.DELIVER_WORK.replace(':id', bookingId)}`,
                completionData
            );

            if (response.data.success) {
                authService.showNotification('Job completed successfully! Customer notified for final payment.', 'success');
                this.closeModal('complete-job-modal');
                
                // Refresh orders section
                setTimeout(() => this.showSection('orders'), 2000);
            }

        } catch (error) {
            authService.showNotification('Failed to complete job', 'error');
            console.error('Job completion error:', error);
        } finally {
            this.hideLoader();
        }
    }

    // Upload deliverables
    async uploadDeliverables(bookingId, files) {
        try {
            const formData = new FormData();
            files.forEach(file => formData.append('deliverables', file));

            const response = await axios.post(
                `${API_CONFIG.BASE_URL}/api/provider/booking/${bookingId}/upload-deliverables`,
                formData,
                {
                    headers: {
                        'Content-Type': 'multipart/form-data'
                    }
                }
            );

            return response.data;
        } catch (error) {
            console.error('Upload deliverables error:', error);
            return { success: false, error: error.message };
        }
    }

    // Utility methods
    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.remove();
        }
    }

    showLoader(containerId) {
        const container = document.getElementById(containerId);
        if (container) {
            container.innerHTML = '<div class="loader">Loading...</div>';
        }
    }

    hideLoader() {
        const loaders = document.querySelectorAll('.loader');
        loaders.forEach(loader => loader.remove());
    }

    createPagination(pagination) {
        if (pagination.pages <= 1) return '';

        let paginationHTML = '<div class="pagination">';
        
        if (pagination.page > 1) {
            paginationHTML += `<button onclick="providerPortal.changePage(${pagination.page - 1})">Previous</button>`;
        }

        for (let i = 1; i <= Math.min(pagination.pages, 5); i++) {
            const isActive = i === pagination.page ? 'active' : '';
            paginationHTML += `<button class="${isActive}" onclick="providerPortal.changePage(${i})">${i}</button>`;
        }

        if (pagination.page < pagination.pages) {
            paginationHTML += `<button onclick="providerPortal.changePage(${pagination.page + 1})">Next</button>`;
        }

        paginationHTML += '</div>';
        return paginationHTML;
    }

    changePage(page) {
        this.currentPage = page;
        this.showSection('orders');
    }

    // Initialize provider portal
    async init() {
        try {
            // Check if user is authenticated and is a provider
            if (!authService.isAuthenticated() || !authService.isProvider()) {
                window.location.href = '/login';
                return;
            }

            // Check onboarding status
            const onboardingComplete = await this.checkOnboardingStatus();
            
            if (onboardingComplete) {
                await this.loadDashboard();
            }
        } catch (error) {
            console.error('Provider portal init error:', error);
            authService.showNotification('Failed to initialize provider portal', 'error');
        }
    }
}

// Initialize provider portal
const providerPortal = new ProviderPortal();
window.providerPortal = providerPortal;

// Initialize on page load for provider pages
document.addEventListener('DOMContentLoaded', () => {
    if (window.location.pathname.includes('/provider/')) {
        providerPortal.init();
    }
});
