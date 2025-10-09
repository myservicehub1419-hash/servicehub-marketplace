class AuthService {
    constructor() {
        this.token = localStorage.getItem('accessToken');
        this.user = JSON.parse(localStorage.getItem('user') || 'null');
        this.setupAxiosInterceptors();
    }

    // Setup axios interceptors for automatic token handling
    setupAxiosInterceptors() {
        // Request interceptor to add token
        axios.interceptors.request.use(
            (config) => {
                if (this.token) {
                    config.headers.Authorization = `Bearer ${this.token}`;
                }
                return config;
            },
            (error) => Promise.reject(error)
        );

        // Response interceptor to handle token refresh
        axios.interceptors.response.use(
            (response) => response,
            async (error) => {
                const originalRequest = error.config;
                
                if (error.response?.status === 401 && !originalRequest._retry) {
                    originalRequest._retry = true;
                    
                    try {
                        await this.refreshToken();
                        originalRequest.headers.Authorization = `Bearer ${this.token}`;
                        return axios(originalRequest);
                    } catch (refreshError) {
                        this.logout();
                        window.location.href = '/login';
                        return Promise.reject(refreshError);
                    }
                }
                
                return Promise.reject(error);
            }
        );
    }

    // Register new user
    async register(userData) {
        try {
            const response = await axios.post(
                `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.REGISTER}`,
                userData
            );

            if (response.data.success) {
                this.showNotification('Registration successful! Check your email for login credentials.', 'success');
                return { success: true, data: response.data };
            }
        } catch (error) {
            const message = error.response?.data?.message || 'Registration failed';
            this.showNotification(message, 'error');
            return { success: false, error: message };
        }
    }

    // Login user
    async login(email, password, rememberMe = false) {
        try {
            const response = await axios.post(
                `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.LOGIN}`,
                { email, password, rememberMe }
            );

            if (response.data.success) {
                const { user, accessToken, redirectTo } = response.data.data;
                
                // Store authentication data
                this.token = accessToken;
                this.user = user;
                localStorage.setItem('accessToken', accessToken);
                localStorage.setItem('user', JSON.stringify(user));

                this.showNotification('Login successful!', 'success');
                
                // Redirect based on user type
                setTimeout(() => {
                    window.location.href = redirectTo || (user.userType === 'customer' ? '/customer/dashboard' : '/provider/dashboard');
                }, 1000);

                return { success: true, data: response.data };
            }
        } catch (error) {
            const message = error.response?.data?.message || 'Login failed';
            this.showNotification(message, 'error');
            return { success: false, error: message };
        }
    }

    // Logout user
    async logout() {
        try {
            if (this.token) {
                await axios.post(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.LOGOUT}`);
            }
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            // Clear all auth data
            this.token = null;
            this.user = null;
            localStorage.removeItem('accessToken');
            localStorage.removeItem('user');
            
            this.showNotification('Logged out successfully', 'info');
            window.location.href = '/';
        }
    }

    // Refresh access token
    async refreshToken() {
        try {
            const response = await axios.post(
                `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.REFRESH_TOKEN}`
            );

            if (response.data.success) {
                this.token = response.data.data.accessToken;
                localStorage.setItem('accessToken', this.token);
                return true;
            }
        } catch (error) {
            console.error('Token refresh failed:', error);
            throw error;
        }
    }

    // Forgot password
    async forgotPassword(email) {
        try {
            const response = await axios.post(
                `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.FORGOT_PASSWORD}`,
                { email }
            );

            if (response.data.success) {
                this.showNotification('Password reset email sent!', 'success');
                return { success: true };
            }
        } catch (error) {
            const message = error.response?.data?.message || 'Failed to send reset email';
            this.showNotification(message, 'error');
            return { success: false, error: message };
        }
    }

    // Reset password
    async resetPassword(token, newPassword) {
        try {
            const response = await axios.post(
                `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.RESET_PASSWORD}/${token}`,
                { password: newPassword }
            );

            if (response.data.success) {
                this.showNotification('Password reset successful!', 'success');
                setTimeout(() => window.location.href = '/login', 2000);
                return { success: true };
            }
        } catch (error) {
            const message = error.response?.data?.message || 'Password reset failed';
            this.showNotification(message, 'error');
            return { success: false, error: message };
        }
    }

    // Get current user profile
    async getProfile() {
        try {
            const response = await axios.get(
                `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.GET_ME}`
            );

            if (response.data.success) {
                this.user = response.data.data.user;
                localStorage.setItem('user', JSON.stringify(this.user));
                return { success: true, data: this.user };
            }
        } catch (error) {
            console.error('Get profile error:', error);
            return { success: false, error: error.response?.data?.message };
        }
    }

    // Update user profile
    async updateProfile(profileData) {
        try {
            const response = await axios.put(
                `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.UPDATE_PROFILE}`,
                profileData
            );

            if (response.data.success) {
                this.user = response.data.data.user;
                localStorage.setItem('user', JSON.stringify(this.user));
                this.showNotification('Profile updated successfully!', 'success');
                return { success: true, data: this.user };
            }
        } catch (error) {
            const message = error.response?.data?.message || 'Profile update failed';
            this.showNotification(message, 'error');
            return { success: false, error: message };
        }
    }

    // Upload avatar
    async uploadAvatar(file) {
        try {
            const formData = new FormData();
            formData.append('avatar', file);

            const response = await axios.post(
                `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.UPLOAD_AVATAR}`,
                formData,
                {
                    headers: {
                        'Content-Type': 'multipart/form-data'
                    }
                }
            );

            if (response.data.success) {
                this.showNotification('Avatar uploaded successfully!', 'success');
                return { success: true, data: response.data.data };
            }
        } catch (error) {
            const message = error.response?.data?.message || 'Avatar upload failed';
            this.showNotification(message, 'error');
            return { success: false, error: message };
        }
    }

    // Utility methods
    isAuthenticated() {
        return !!this.token && !!this.user;
    }

    isCustomer() {
        return this.user?.userType === 'customer';
    }

    isProvider() {
        return this.user?.userType === 'provider';
    }

    getUser() {
        return this.user;
    }

    getToken() {
        return this.token;
    }

    // Show notification
    showNotification(message, type = 'info') {
        // Create notification element if it doesn't exist
        let notification = document.getElementById('notification');
        if (!notification) {
            notification = document.createElement('div');
            notification.id = 'notification';
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 15px 20px;
                border-radius: 5px;
                color: white;
                font-weight: bold;
                z-index: 10000;
                opacity: 0;
                transition: opacity 0.3s ease;
                max-width: 400px;
                word-wrap: break-word;
            `;
            document.body.appendChild(notification);
        }

        // Set notification style based on type
        const colors = {
            success: '#10B981',
            error: '#EF4444',
            info: '#3B82F6',
            warning: '#F59E0B'
        };

        notification.style.backgroundColor = colors[type] || colors.info;
        notification.textContent = message;
        notification.style.opacity = '1';

        // Auto hide after 5 seconds
        setTimeout(() => {
            notification.style.opacity = '0';
        }, 5000);
    }

    // Check authentication on page load
    checkAuth() {
        if (!this.isAuthenticated()) {
            // Redirect to login if on protected page
            const protectedPages = ['/customer/', '/provider/'];
            const currentPath = window.location.pathname;
            
            if (protectedPages.some(path => currentPath.includes(path))) {
                window.location.href = '/login';
            }
        }
    }

    // Initialize authentication
    init() {
        this.checkAuth();
        
        // Update UI based on auth status
        this.updateUI();
    }

    // Update UI elements based on authentication status
    updateUI() {
        const authButtons = document.querySelectorAll('.auth-required');
        const guestButtons = document.querySelectorAll('.guest-only');
        const userInfo = document.querySelectorAll('.user-info');

        if (this.isAuthenticated()) {
            authButtons.forEach(btn => btn.style.display = 'block');
            guestButtons.forEach(btn => btn.style.display = 'none');
            
            // Update user info displays
            userInfo.forEach(info => {
                if (info.classList.contains('user-name')) {
                    info.textContent = `${this.user.firstName} ${this.user.lastName}`;
                }
                if (info.classList.contains('user-email')) {
                    info.textContent = this.user.email;
                }
                if (info.classList.contains('user-avatar') && this.user.avatar) {
                    info.src = this.user.avatar;
                }
            });
        } else {
            authButtons.forEach(btn => btn.style.display = 'none');
            guestButtons.forEach(btn => btn.style.display = 'block');
        }
    }
}

// Initialize authentication service
const authService = new AuthService();
window.authService = authService;

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    authService.init();
});
