class CustomerPortal {
    constructor() {
        this.currentPage = 1;
        this.currentFilters = {};
        this.searchTimeout = null;
    }

    // Load customer dashboard
    async loadDashboard() {
        try {
            this.showLoader('dashboard-content');
            
            const response = await axios.get(
                `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.CUSTOMER_DASHBOARD}`
            );

            if (response.data.success) {
                this.renderDashboard(response.data.data);
            }
        } catch (error) {
            this.showError('Failed to load dashboard');
            console.error('Dashboard error:', error);
        } finally {
            this.hideLoader();
        }
    }

    // Render dashboard content
    renderDashboard(data) {
        // Update stats
        if (data.customerStats) {
            this.updateStats(data.customerStats);
        }

        // Render featured services
        if (data.featuredServices) {
            this.renderFeaturedServices(data.featuredServices);
        }

        // Render services by category
        if (data.servicesByCategory) {
            this.renderServiceCategories(data.servicesByCategory);
        }

        // Render recent bookings
        if (data.recentBookings) {
            this.renderRecentBookings(data.recentBookings);
        }
    }

    // Update dashboard stats
    updateStats(stats) {
        const statsElements = {
            'total-bookings': stats.totalBookings,
            'active-bookings': stats.activeBookings,
            'completed-bookings': stats.completedBookings,
            'total-spent': `₹${stats.totalSpent.toLocaleString()}`
        };

        Object.entries(statsElements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = value;
            }
        });
    }

    // Render featured services
    renderFeaturedServices(services) {
        const container = document.getElementById('featured-services');
        if (!container) return;

        const servicesHTML = services.map(service => this.createServiceCard(service)).join('');
        container.innerHTML = `
            <h3>Featured Services</h3>
            <div class="services-grid">
                ${servicesHTML}
            </div>
        `;
    }

    // Create service card HTML
    createServiceCard(service) {
        const provider = service.providerId;
        const primaryImage = service.images?.find(img => img.isPrimary)?.url || service.images?.[0]?.url || '/images/default-service.jpg';
        
        return `
            <div class="service-card" onclick="customerPortal.viewService('${service._id}')">
                <div class="service-image">
                    <img src="${primaryImage}" alt="${service.title}" />
                    ${service.rating.average > 0 ? `
                        <div class="service-rating">
                            <i class="fas fa-star"></i>
                            <span>${service.rating.average.toFixed(1)} (${service.rating.count})</span>
                        </div>
                    ` : ''}
                </div>
                <div class="service-content">
                    <h4>${service.title}</h4>
                    <p class="service-description">${service.shortDescription}</p>
                    <div class="service-provider">
                        <img src="${provider.avatar || '/images/default-avatar.jpg'}" alt="${provider.firstName}" class="provider-avatar" />
                        <span>${provider.firstName} ${provider.lastName}</span>
                        ${provider.providerInfo?.rating > 0 ? `
                            <span class="provider-rating">★ ${provider.providerInfo.rating.toFixed(1)}</span>
                        ` : ''}
                    </div>
                    <div class="service-pricing">
                        <span class="price">From ₹${service.pricing.basePrice.toLocaleString()}</span>
                        <button class="btn btn-primary book-now-btn" onclick="event.stopPropagation(); customerPortal.bookService('${service._id}')">
                            Book Now
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    // Search services
    async searchServices(query = '', filters = {}, page = 1) {
        try {
            this.showLoader('search-results');
            
            const params = new URLSearchParams({
                query,
                page,
                limit: APP_CONFIG.PAGINATION.DEFAULT_LIMIT,
                ...filters
            });

            const response = await axios.get(
                `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.SEARCH_SERVICES}?${params}`
            );

            if (response.data.success) {
                this.renderSearchResults(response.data.data);
            }
        } catch (error) {
            this.showError('Search failed');
            console.error('Search error:', error);
        } finally {
            this.hideLoader();
        }
    }

    // Render search results
    renderSearchResults(data) {
        const container = document.getElementById('search-results');
        if (!container) return;

        const { services, pagination } = data;

        if (services.length === 0) {
            container.innerHTML = `
                <div class="no-results">
                    <h3>No services found</h3>
                    <p>Try adjusting your search criteria</p>
                </div>
            `;
            return;
        }

        const servicesHTML = services.map(service => this.createServiceCard(service)).join('');
        
        container.innerHTML = `
            <div class="search-header">
                <h3>Search Results (${pagination.total} services found)</h3>
                <div class="search-filters">
                    <select id="sort-by" onchange="customerPortal.handleSortChange(this.value)">
                        <option value="relevance">Most Relevant</option>
                        <option value="price_low">Price: Low to High</option>
                        <option value="price_high">Price: High to Low</option>
                        <option value="rating">Highest Rated</option>
                        <option value="newest">Newest</option>
                        <option value="popular">Most Popular</option>
                    </select>
                </div>
            </div>
            <div class="services-grid">
                ${servicesHTML}
            </div>
            ${this.createPagination(pagination)}
        `;
    }

    // Create pagination HTML
    createPagination(pagination) {
        if (pagination.pages <= 1) return '';

        let paginationHTML = '<div class="pagination">';
        
        // Previous button
        if (pagination.page > 1) {
            paginationHTML += `<button onclick="customerPortal.changePage(${pagination.page - 1})">Previous</button>`;
        }

        // Page numbers
        for (let i = 1; i <= Math.min(pagination.pages, 5); i++) {
            const isActive = i === pagination.page ? 'active' : '';
            paginationHTML += `<button class="${isActive}" onclick="customerPortal.changePage(${i})">${i}</button>`;
        }

        // Next button
        if (pagination.page < pagination.pages) {
            paginationHTML += `<button onclick="customerPortal.changePage(${pagination.page + 1})">Next</button>`;
        }

        paginationHTML += '</div>';
        return paginationHTML;
    }

    // View service details
    async viewService(serviceId) {
        try {
            this.showLoader('service-details');
            
            const response = await axios.get(
                `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.GET_SERVICE}/${serviceId}`
            );

            if (response.data.success) {
                this.renderServiceDetails(response.data.data);
            }
        } catch (error) {
            this.showError('Failed to load service details');
            console.error('Service details error:', error);
        } finally {
            this.hideLoader();
        }
    }

    // Book service - Get booking form
    async bookService(serviceId) {
        try {
            if (!authService.isAuthenticated()) {
                authService.showNotification('Please login to book services', 'warning');
                window.location.href = '/login';
                return;
            }

            const response = await axios.get(
                `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.GET_SERVICE}/booking-form/${serviceId}`
            );

            if (response.data.success) {
                this.showBookingModal(response.data.data);
            }
        } catch (error) {
            authService.showNotification('Failed to load booking form', 'error');
            console.error('Booking form error:', error);
        }
    }

    // Show booking modal
    showBookingModal(data) {
        const { service, bookingForm } = data;
        
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'booking-modal';
        
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Book Service: ${service.title}</h2>
                    <span class="modal-close" onclick="customerPortal.closeBookingModal()">&times;</span>
                </div>
                <div class="modal-body">
                    <form id="booking-form">
                        ${this.createBookingForm(bookingForm, service)}
                        <div class="form-actions">
                            <button type="button" class="btn btn-secondary" onclick="customerPortal.closeBookingModal()">Cancel</button>
                            <button type="submit" class="btn btn-primary">Continue to Payment</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Handle form submission
        document.getElementById('booking-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.submitBookingForm(service._id);
        });
        
        // Show modal
        setTimeout(() => modal.style.display = 'flex', 10);
    }

    // Create booking form HTML
    createBookingForm(formFields, service) {
        return formFields.map(field => {
            switch (field.type) {
                case 'select':
                    return `
                        <div class="form-group">
                            <label for="${field.name}">${field.label}${field.required ? '*' : ''}</label>
                            <select name="${field.name}" id="${field.name}" ${field.required ? 'required' : ''} onchange="customerPortal.updatePackagePrice(this)">
                                <option value="">Select ${field.label}</option>
                                ${field.options.map(opt => `
                                    <option value="${opt.value}" data-price="${opt.price}" data-delivery="${opt.deliveryDays}">
                                        ${opt.label}
                                    </option>
                                `).join('')}
                            </select>
                        </div>
                    `;
                case 'textarea':
                    return `
                        <div class="form-group">
                            <label for="${field.name}">${field.label}${field.required ? '*' : ''}</label>
                            <textarea name="${field.name}" id="${field.name}" ${field.required ? 'required' : ''} maxlength="${field.maxLength || ''}"></textarea>
                        </div>
                    `;
                case 'file':
                    return `
                        <div class="form-group">
                            <label for="${field.name}">${field.label}${field.required ? '*' : ''}</label>
                            <input type="file" name="${field.name}" id="${field.name}" ${field.multiple ? 'multiple' : ''} accept="${field.acceptedTypes?.join(',') || ''}" />
                            <small>Max ${field.maxFiles || 1} files, up to 10MB each</small>
                        </div>
                    `;
                default:
                    return `
                        <div class="form-group">
                            <label for="${field.name}">${field.label}${field.required ? '*' : ''}</label>
                            <input type="${field.type}" name="${field.name}" id="${field.name}" ${field.required ? 'required' : ''} maxlength="${field.maxLength || ''}" />
                        </div>
                    `;
            }
        }).join('') + `
            <div class="pricing-summary" id="pricing-summary" style="display: none;">
                <h4>Pricing Summary</h4>
                <div class="price-row">
                    <span>Package Price:</span>
                    <span id="package-price">₹0</span>
                </div>
                <div class="price-row">
                    <span>Initial Payment (50%):</span>
                    <span id="half-payment">₹0</span>
                </div>
                <div class="price-row">
                    <span>Remaining Payment:</span>
                    <span id="remaining-payment">₹0</span>
                </div>
                <div class="delivery-info">
                    <span>Estimated Delivery:</span>
                    <span id="delivery-time">-</span>
                </div>
            </div>
        `;
    }

    // Update package price in booking form
    updatePackagePrice(selectElement) {
        const selectedOption = selectElement.selectedOptions[0];
        if (!selectedOption) return;

        const price = parseInt(selectedOption.dataset.price);
        const deliveryDays = parseInt(selectedOption.dataset.delivery);
        
        const halfPrice = price / 2;
        
        document.getElementById('package-price').textContent = `₹${price.toLocaleString()}`;
        document.getElementById('half-payment').textContent = `₹${halfPrice.toLocaleString()}`;
        document.getElementById('remaining-payment').textContent = `₹${halfPrice.toLocaleString()}`;
        
        const deliveryDate = new Date();
        deliveryDate.setDate(deliveryDate.getDate() + deliveryDays);
        document.getElementById('delivery-time').textContent = deliveryDate.toLocaleDateString();
        
        document.getElementById('pricing-summary').style.display = 'block';
    }

    // Submit booking form
    async submitBookingForm(serviceId) {
        try {
            const form = document.getElementById('booking-form');
            const formData = new FormData(form);
            
            const bookingData = {
                serviceId,
                selectedPackage: formData.get('selectedPackage'),
                projectTitle: formData.get('projectTitle'),
                projectDescription: formData.get('projectDescription'),
                requirements: formData.get('requirements'),
                deadline: formData.get('deadline') || null
            };

            this.showLoader('booking-form');

            const response = await axios.post(
                `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.CREATE_BOOKING}`,
                bookingData
            );

            if (response.data.success) {
                this.closeBookingModal();
                // Proceed to half payment
                this.initiateHalfPayment(response.data.data.booking);
            }
        } catch (error) {
            authService.showNotification('Booking creation failed', 'error');
            console.error('Booking error:', error);
        } finally {
            this.hideLoader();
        }
    }

    // Close booking modal
    closeBookingModal() {
        const modal = document.getElementById('booking-modal');
        if (modal) {
            modal.remove();
        }
    }

    // Initiate half payment
    async initiateHalfPayment(booking) {
        try {
            // Redirect to payment page with booking details
            const paymentUrl = `/payment?bookingId=${booking._id}&amount=${booking.halfAmount}&type=half`;
            window.location.href = paymentUrl;
        } catch (error) {
            authService.showNotification('Payment initialization failed', 'error');
            console.error('Payment init error:', error);
        }
    }

    // Utility methods
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

    showError(message) {
        authService.showNotification(message, 'error');
    }

    changePage(page) {
        this.currentPage = page;
        this.searchServices('', this.currentFilters, page);
    }

    handleSortChange(sortBy) {
        this.currentFilters.sortBy = sortBy;
        this.searchServices('', this.currentFilters, 1);
    }
}

// Initialize customer portal
const customerPortal = new CustomerPortal();
window.customerPortal = customerPortal;
