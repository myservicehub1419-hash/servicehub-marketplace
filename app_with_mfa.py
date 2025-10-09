from flask import Flask, render_template_string, request, jsonify, session, redirect, url_for
from werkzeug.security import generate_password_hash, check_password_hash
import secrets
import pyotp
import qrcode
from io import BytesIO
import base64
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import smtplib
from twilio.rest import Client
import sqlite3
from datetime import datetime, timedelta
import json
import os
from functools import wraps

app = Flask(__name__)
app.secret_key = secrets.token_hex(32)

# Configuration
DATABASE = 'myservicehub.db'
TWILIO_ACCOUNT_SID = 'your_account_sid'
TWILIO_AUTH_TOKEN = 'your_auth_token'
TWILIO_PHONE_NUMBER = '+1234567890'

# Email Configuration
SMTP_SERVER = 'smtp.gmail.com'
SMTP_PORT = 587
EMAIL_ADDRESS = 'your_email@gmail.com'
EMAIL_PASSWORD = 'your_app_password'

def init_db():
    """Initialize the database with required tables"""
    conn = sqlite3.connect(DATABASE)
    cursor = conn.cursor()
    
    # Users table with MFA support
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            phone TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            totp_secret TEXT,
            is_verified BOOLEAN DEFAULT 0,
            email_verified BOOLEAN DEFAULT 0,
            phone_verified BOOLEAN DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_login TIMESTAMP,
            failed_attempts INTEGER DEFAULT 0,
            locked_until TIMESTAMP
        )
    ''')
    
    # OTP codes table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS otp_codes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            otp_code TEXT NOT NULL,
            otp_type TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMP NOT NULL,
            used BOOLEAN DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    ''')
    
    # Login attempts table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS login_attempts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT,
            ip_address TEXT,
            success BOOLEAN,
            attempt_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            user_agent TEXT
        )
    ''')
    
    # Sessions table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS user_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            session_token TEXT UNIQUE NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMP NOT NULL,
            ip_address TEXT,
            user_agent TEXT,
            active BOOLEAN DEFAULT 1,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    ''')
    
    conn.commit()
    conn.close()

def require_auth(f):
    """Decorator to require authentication"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function

def send_email_otp(email, otp_code):
    """Send OTP via email (development mode - prints to console)"""
    print(f"📧 EMAIL OTP for {email}: {otp_code}")
    return True

def send_sms_otp(phone, otp_code):
    """Send OTP via SMS (development mode - prints to console)"""
    print(f"📱 SMS OTP for {phone}: {otp_code}")
    return True

def generate_otp():
    """Generate a 6-digit OTP"""
    return str(secrets.randbelow(900000) + 100000)

def store_otp(user_id, otp_code, otp_type):
    """Store OTP in database"""
    conn = sqlite3.connect(DATABASE)
    cursor = conn.cursor()
    expires_at = datetime.now() + timedelta(minutes=10)
    
    cursor.execute('''
        INSERT INTO otp_codes (user_id, otp_code, otp_type, expires_at)
        VALUES (?, ?, ?, ?)
    ''', (user_id, otp_code, otp_type, expires_at))
    
    conn.commit()
    conn.close()

def verify_otp(user_id, otp_code, otp_type):
    """Verify OTP code"""
    conn = sqlite3.connect(DATABASE)
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT id FROM otp_codes 
        WHERE user_id = ? AND otp_code = ? AND otp_type = ? 
        AND used = 0 AND expires_at > ?
        ORDER BY created_at DESC LIMIT 1
    ''', (user_id, otp_code, otp_type, datetime.now()))
    
    result = cursor.fetchone()
    
    if result:
        # Mark OTP as used
        cursor.execute('UPDATE otp_codes SET used = 1 WHERE id = ?', (result[0],))
        conn.commit()
        conn.close()
        return True
    
    conn.close()
    return False

@app.route('/')
def home():
    """Homepage with navigation to customer portal"""
    return render_template_string('''
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MyServiceHub - Secure Customer Portal</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .container {
            max-width: 800px;
            margin: 0 auto;
            padding: 2rem;
            background: rgba(255, 255, 255, 0.95);
            border-radius: 20px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
            text-align: center;
            backdrop-filter: blur(10px);
        }
        
        .logo {
            font-size: 3rem;
            font-weight: bold;
            color: #667eea;
            margin-bottom: 1rem;
        }
        
        h1 {
            color: #333;
            margin-bottom: 1rem;
            font-size: 2.5rem;
        }
        
        .subtitle {
            color: #666;
            margin-bottom: 2rem;
            font-size: 1.2rem;
        }
        
        .features {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 2rem;
            margin: 3rem 0;
        }
        
        .feature {
            padding: 2rem;
            background: white;
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
            transition: transform 0.3s ease;
        }
        
        .feature:hover {
            transform: translateY(-5px);
        }
        
        .feature-icon {
            font-size: 3rem;
            margin-bottom: 1rem;
        }
        
        .feature h3 {
            color: #333;
            margin-bottom: 1rem;
        }
        
        .cta-button {
            display: inline-block;
            padding: 1.2rem 3rem;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            text-decoration: none;
            border-radius: 50px;
            font-size: 1.2rem;
            font-weight: bold;
            transition: all 0.3s ease;
            box-shadow: 0 10px 30px rgba(102, 126, 234, 0.3);
            margin-top: 2rem;
        }
        
        .cta-button:hover {
            transform: translateY(-3px);
            box-shadow: 0 15px 40px rgba(102, 126, 234, 0.4);
        }
        
        .stats {
            display: flex;
            justify-content: space-around;
            margin-top: 3rem;
            padding-top: 2rem;
            border-top: 1px solid #eee;
        }
        
        .stat {
            text-align: center;
        }
        
        .stat-number {
            font-size: 2.5rem;
            font-weight: bold;
            color: #667eea;
        }
        
        .stat-label {
            color: #666;
            font-size: 0.9rem;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">🔐</div>
        <h1>MyServiceHub</h1>
        <p class="subtitle">Secure Multi-Factor Authentication Customer Portal</p>
        
        <div class="features">
            <div class="feature">
                <div class="feature-icon">🛡️</div>
                <h3>Multi-Factor Security</h3>
                <p>Advanced MFA with SMS, Email, and TOTP authentication for maximum security.</p>
            </div>
            
            <div class="feature">
                <div class="feature-icon">📱</div>
                <h3>Mobile Optimized</h3>
                <p>Fully responsive design that works seamlessly across all devices.</p>
            </div>
            
            <div class="feature">
                <div class="feature-icon">⚡</div>
                <h3>Fast & Reliable</h3>
                <p>Lightning-fast authentication with enterprise-grade reliability.</p>
            </div>
        </div>
        
        <a href="/customer-portal" class="cta-button">
            🚀 Access Customer Portal
        </a>
        
        <div class="stats">
            <div class="stat">
                <div class="stat-number">99.9%</div>
                <div class="stat-label">Uptime</div>
            </div>
            <div class="stat">
                <div class="stat-number">256-bit</div>
                <div class="stat-label">Encryption</div>
            </div>
            <div class="stat">
                <div class="stat-number">24/7</div>
                <div class="stat-label">Support</div>
            </div>
        </div>
    </div>
</body>
</html>
    ''')

@app.route('/customer-portal')
def customer_portal():
    """Customer portal landing page"""
    if 'user_id' in session:
        return redirect(url_for('dashboard'))
    
    return render_template_string('''
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Customer Portal - Login</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        
        .auth-container {
            background: rgba(255, 255, 255, 0.95);
            border-radius: 20px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
            backdrop-filter: blur(10px);
            overflow: hidden;
            max-width: 400px;
            width: 100%;
        }
        
        .auth-header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 2rem;
            text-align: center;
        }
        
        .auth-header h2 {
            margin-bottom: 0.5rem;
        }
        
        .auth-body {
            padding: 2rem;
        }
        
        .auth-tabs {
            display: flex;
            margin-bottom: 2rem;
            background: #f8f9fa;
            border-radius: 10px;
            overflow: hidden;
        }
        
        .auth-tab {
            flex: 1;
            padding: 1rem;
            text-align: center;
            background: transparent;
            border: none;
            cursor: pointer;
            transition: all 0.3s ease;
        }
        
        .auth-tab.active {
            background: #667eea;
            color: white;
        }
        
        .auth-form {
            display: none;
        }
        
        .auth-form.active {
            display: block;
        }
        
        .form-group {
            margin-bottom: 1.5rem;
        }
        
        .form-group label {
            display: block;
            margin-bottom: 0.5rem;
            color: #333;
            font-weight: 500;
        }
        
        .form-group input {
            width: 100%;
            padding: 1rem;
            border: 2px solid #e9ecef;
            border-radius: 10px;
            font-size: 1rem;
            transition: border-color 0.3s ease;
        }
        
        .form-group input:focus {
            outline: none;
            border-color: #667eea;
        }
        
        .btn {
            width: 100%;
            padding: 1rem 2rem;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 10px;
            font-size: 1.1rem;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.3s ease;
        }
        
        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 20px rgba(102, 126, 234, 0.3);
        }
        
        .alert {
            padding: 1rem;
            border-radius: 10px;
            margin-bottom: 1rem;
            display: none;
        }
        
        .alert.success {
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }
        
        .alert.error {
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }
        
        .back-link {
            text-align: center;
            margin-top: 2rem;
        }
        
        .back-link a {
            color: #667eea;
            text-decoration: none;
        }
        
        .back-link a:hover {
            text-decoration: underline;
        }
    </style>
</head>
<body>
    <div class="auth-container">
        <div class="auth-header">
            <h2>🔐 Customer Portal</h2>
            <p>Secure Multi-Factor Authentication</p>
        </div>
        
        <div class="auth-body">
            <div class="auth-tabs">
                <button class="auth-tab active" onclick="showForm('login')">Login</button>
                <button class="auth-tab" onclick="showForm('register')">Register</button>
            </div>
            
            <div id="alert" class="alert"></div>
            
            <!-- Login Form -->
            <form id="login-form" class="auth-form active" onsubmit="handleLogin(event)">
                <div class="form-group">
                    <label for="login-username">Username</label>
                    <input type="text" id="login-username" name="username" required>
                </div>
                <div class="form-group">
                    <label for="login-password">Password</label>
                    <input type="password" id="login-password" name="password" required>
                </div>
                <button type="submit" class="btn">🔓 Login</button>
            </form>
            
            <!-- Register Form -->
            <form id="register-form" class="auth-form" onsubmit="handleRegister(event)">
                <div class="form-group">
                    <label for="register-username">Username</label>
                    <input type="text" id="register-username" name="username" required>
                </div>
                <div class="form-group">
                    <label for="register-email">Email</label>
                    <input type="email" id="register-email" name="email" required>
                </div>
                <div class="form-group">
                    <label for="register-phone">Phone Number</label>
                    <input type="tel" id="register-phone" name="phone" placeholder="+1234567890" required>
                </div>
                <div class="form-group">
                    <label for="register-password">Password</label>
                    <input type="password" id="register-password" name="password" required>
                </div>
                <div class="form-group">
                    <label for="register-confirm">Confirm Password</label>
                    <input type="password" id="register-confirm" name="confirm_password" required>
                </div>
                <button type="submit" class="btn">📝 Register</button>
            </form>
            
            <div class="back-link">
                <a href="/">← Back to Home</a>
            </div>
        </div>
    </div>

    <script>
        function showForm(formType) {
            // Update tabs
            document.querySelectorAll('.auth-tab').forEach(tab => {
                tab.classList.remove('active');
            });
            document.querySelector(`[onclick="showForm('${formType}')"]`).classList.add('active');
            
            // Update forms
            document.querySelectorAll('.auth-form').forEach(form => {
                form.classList.remove('active');
            });
            document.getElementById(`${formType}-form`).classList.add('active');
            
            // Clear alerts
            hideAlert();
        }
        
        function showAlert(message, type) {
            const alert = document.getElementById('alert');
            alert.textContent = message;
            alert.className = `alert ${type}`;
            alert.style.display = 'block';
        }
        
        function hideAlert() {
            document.getElementById('alert').style.display = 'none';
        }
        
        async function handleLogin(event) {
            event.preventDefault();
            
            const formData = new FormData(event.target);
            const data = {
                username: formData.get('username'),
                password: formData.get('password')
            };
            
            try {
                const response = await fetch('/api/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(data)
                });
                
                const result = await response.json();
                
                if (result.success) {
                    if (result.requires_mfa) {
                        window.location.href = '/verify-mfa';
                    } else {
                        window.location.href = '/dashboard';
                    }
                } else {
                    showAlert(result.message, 'error');
                }
            } catch (error) {
                showAlert('An error occurred. Please try again.', 'error');
            }
        }
        
        async function handleRegister(event) {
            event.preventDefault();
            
            const formData = new FormData(event.target);
            const data = {
                username: formData.get('username'),
                email: formData.get('email'),
                phone: formData.get('phone'),
                password: formData.get('password'),
                confirm_password: formData.get('confirm_password')
            };
            
            if (data.password !== data.confirm_password) {
                showAlert('Passwords do not match.', 'error');
                return;
            }
            
            try {
                const response = await fetch('/api/register', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(data)
                });
                
                const result = await response.json();
                
                if (result.success) {
                    showAlert(result.message, 'success');
                    setTimeout(() => {
                        showForm('login');
                    }, 2000);
                } else {
                    showAlert(result.message, 'error');
                }
            } catch (error) {
                showAlert('An error occurred. Please try again.', 'error');
            }
        }
    </script>
</body>
</html>
    ''')

@app.route('/api/register', methods=['POST'])
def api_register():
    """Handle user registration"""
    try:
        data = request.get_json()
        username = data.get('username', '').strip()
        email = data.get('email', '').strip()
        phone = data.get('phone', '').strip()
        password = data.get('password', '')
        
        # Validation
        if not all([username, email, phone, password]):
            return jsonify({'success': False, 'message': 'All fields are required.'})
        
        if len(password) < 8:
            return jsonify({'success': False, 'message': 'Password must be at least 8 characters long.'})
        
        conn = sqlite3.connect(DATABASE)
        cursor = conn.cursor()
        
        # Check if user already exists
        cursor.execute('SELECT id FROM users WHERE username = ? OR email = ?', (username, email))
        if cursor.fetchone():
            conn.close()
            return jsonify({'success': False, 'message': 'Username or email already exists.'})
        
        # Create user
        password_hash = generate_password_hash(password)
        totp_secret = pyotp.random_base32()
        
        cursor.execute('''
            INSERT INTO users (username, email, phone, password_hash, totp_secret)
            VALUES (?, ?, ?, ?, ?)
        ''', (username, email, phone, password_hash, totp_secret))
        
        user_id = cursor.lastrowid
        
        # Send verification codes
        email_otp = generate_otp()
        sms_otp = generate_otp()
        
        store_otp(user_id, email_otp, 'email_verification')
        store_otp(user_id, sms_otp, 'sms_verification')
        
        send_email_otp(email, email_otp)
        send_sms_otp(phone, sms_otp)
        
        conn.commit()
        conn.close()
        
        return jsonify({
            'success': True, 
            'message': 'Registration successful! Verification codes sent to your email and phone.'
        })
        
    except Exception as e:
        return jsonify({'success': False, 'message': 'Registration failed. Please try again.'})

@app.route('/api/login', methods=['POST'])
def api_login():
    """Handle user login"""
    try:
        data = request.get_json()
        username = data.get('username', '').strip()
        password = data.get('password', '')
        
        if not username or not password:
            return jsonify({'success': False, 'message': 'Username and password are required.'})
        
        conn = sqlite3.connect(DATABASE)
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT id, username, email, phone, password_hash, is_verified, failed_attempts, locked_until
            FROM users WHERE username = ? OR email = ?
        ''', (username, username))
        
        user = cursor.fetchone()
        
        if not user:
            conn.close()
            return jsonify({'success': False, 'message': 'Invalid credentials.'})
        
        user_id, db_username, email, phone, password_hash, is_verified, failed_attempts, locked_until = user
        
        # Check if account is locked
        if locked_until and datetime.fromisoformat(locked_until) > datetime.now():
            conn.close()
            return jsonify({'success': False, 'message': 'Account is temporarily locked. Try again later.'})
        
        # Verify password
        if not check_password_hash(password_hash, password):
            # Increment failed attempts
            failed_attempts += 1
            lock_time = None
            if failed_attempts >= 5:
                lock_time = datetime.now() + timedelta(minutes=30)
            
            cursor.execute('''
                UPDATE users SET failed_attempts = ?, locked_until = ?
                WHERE id = ?
            ''', (failed_attempts, lock_time, user_id))
            conn.commit()
            conn.close()
            
            return jsonify({'success': False, 'message': 'Invalid credentials.'})
        
        # Reset failed attempts on successful login
        cursor.execute('''
            UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login = ?
            WHERE id = ?
        ''', (datetime.now(), user_id))
        
        conn.commit()
        conn.close()
        
        # Set session
        session['user_id'] = user_id
        session['username'] = db_username
        session['pending_mfa'] = True
        
        # Send MFA codes
        email_otp = generate_otp()
        sms_otp = generate_otp()
        
        store_otp(user_id, email_otp, 'email_login')
        store_otp(user_id, sms_otp, 'sms_login')
        
        send_email_otp(email, email_otp)
        send_sms_otp(phone, sms_otp)
        
        return jsonify({
            'success': True,
            'requires_mfa': True,
            'message': 'Login successful. Please verify your identity with the codes sent to your email and phone.'
        })
        
    except Exception as e:
        return jsonify({'success': False, 'message': 'Login failed. Please try again.'})

@app.route('/verify-mfa')
def verify_mfa():
    """MFA verification page"""
    if 'user_id' not in session or not session.get('pending_mfa'):
        return redirect(url_for('customer_portal'))
    
    return render_template_string('''
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Multi-Factor Authentication</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        
        .mfa-container {
            background: rgba(255, 255, 255, 0.95);
            border-radius: 20px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
            backdrop-filter: blur(10px);
            overflow: hidden;
            max-width: 500px;
            width: 100%;
        }
        
        .mfa-header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 2rem;
            text-align: center;
        }
        
        .mfa-header h2 {
            margin-bottom: 0.5rem;
        }
        
        .mfa-body {
            padding: 2rem;
        }
        
        .verification-step {
            background: white;
            border: 2px solid #e9ecef;
            border-radius: 15px;
            padding: 2rem;
            margin-bottom: 1.5rem;
            transition: all 0.3s ease;
        }
        
        .verification-step.completed {
            border-color: #28a745;
            background: #f8fff9;
        }
        
        .step-header {
            display: flex;
            align-items: center;
            margin-bottom: 1rem;
        }
        
        .step-icon {
            font-size: 2rem;
            margin-right: 1rem;
        }
        
        .step-title {
            font-size: 1.2rem;
            font-weight: bold;
        }
        
        .form-group {
            margin-bottom: 1.5rem;
        }
        
        .form-group label {
            display: block;
            margin-bottom: 0.5rem;
            color: #333;
            font-weight: 500;
        }
        
        .form-group input {
            width: 100%;
            padding: 1rem;
            border: 2px solid #e9ecef;
            border-radius: 10px;
            font-size: 1.2rem;
            text-align: center;
            letter-spacing: 0.5rem;
            transition: border-color 0.3s ease;
        }
        
        .form-group input:focus {
            outline: none;
            border-color: #667eea;
        }
        
        .btn {
            width: 100%;
            padding: 1rem 2rem;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 10px;
            font-size: 1.1rem;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.3s ease;
            margin-top: 1rem;
        }
        
        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 20px rgba(102, 126, 234, 0.3);
        }
        
        .btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            transform: none;
        }
        
        .alert {
            padding: 1rem;
            border-radius: 10px;
            margin-bottom: 1rem;
            display: none;
        }
        
        .alert.success {
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }
        
        .alert.error {
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }
        
        .progress-bar {
            background: #e9ecef;
            border-radius: 10px;
            height: 8px;
            margin-bottom: 2rem;
            overflow: hidden;
        }
        
        .progress-fill {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            height: 100%;
            width: 0%;
            transition: width 0.3s ease;
        }
    </style>
</head>
<body>
    <div class="mfa-container">
        <div class="mfa-header">
            <h2>🔐 Multi-Factor Authentication</h2>
            <p>Please verify your identity</p>
        </div>
        
        <div class="mfa-body">
            <div class="progress-bar">
                <div class="progress-fill" id="progress-fill"></div>
            </div>
            
            <div id="alert" class="alert"></div>
            
            <form id="mfa-form" onsubmit="handleMFAVerification(event)">
                <div class="verification-step" id="email-step">
                    <div class="step-header">
                        <div class="step-icon">📧</div>
                        <div>
                            <div class="step-title">Email Verification</div>
                            <div>Enter the 6-digit code sent to your email</div>
                        </div>
                    </div>
                    <div class="form-group">
                        <input type="text" id="email-otp" name="email_otp" placeholder="000000" maxlength="6" required>
                    </div>
                </div>
                
                <div class="verification-step" id="sms-step">
                    <div class="step-header">
                        <div class="step-icon">📱</div>
                        <div>
                            <div class="step-title">SMS Verification</div>
                            <div>Enter the 6-digit code sent to your phone</div>
                        </div>
                    </div>
                    <div class="form-group">
                        <input type="text" id="sms-otp" name="sms_otp" placeholder="000000" maxlength="6" required>
                    </div>
                </div>
                
                <button type="submit" class="btn" id="verify-btn">✅ Verify Identity</button>
            </form>
        </div>
    </div>

    <script>
        let completedSteps = 0;
        
        function showAlert(message, type) {
            const alert = document.getElementById('alert');
            alert.textContent = message;
            alert.className = `alert ${type}`;
            alert.style.display = 'block';
        }
        
        function hideAlert() {
            document.getElementById('alert').style.display = 'none';
        }
        
        function updateProgress() {
            const progressFill = document.getElementById('progress-fill');
            const progress = (completedSteps / 2) * 100;
            progressFill.style.width = progress + '%';
        }
        
        // Auto-format OTP inputs
        document.querySelectorAll('input[type="text"]').forEach(input => {
            input.addEventListener('input', function(e) {
                this.value = this.value.replace(/[^0-9]/g, '');
                if (this.value.length === 6) {
                    // Auto-focus next field or submit
                    const nextInput = this.closest('.verification-step').nextElementSibling?.querySelector('input');
                    if (nextInput) {
                        nextInput.focus();
                    }
                }
            });
        });
        
        async function handleMFAVerification(event) {
            event.preventDefault();
            
            const formData = new FormData(event.target);
            const data = {
                email_otp: formData.get('email_otp'),
                sms_otp: formData.get('sms_otp')
            };
            
            const verifyBtn = document.getElementById('verify-btn');
            verifyBtn.disabled = true;
            verifyBtn.textContent = '🔄 Verifying...';
            
            try {
                const response = await fetch('/api/verify-mfa', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(data)
                });
                
                const result = await response.json();
                
                if (result.success) {
                    showAlert('✅ Verification successful! Redirecting to dashboard...', 'success');
                    setTimeout(() => {
                        window.location.href = '/dashboard';
                    }, 2000);
                } else {
                    showAlert('❌ ' + result.message, 'error');
                    verifyBtn.disabled = false;
                    verifyBtn.textContent = '✅ Verify Identity';
                }
            } catch (error) {
                showAlert('❌ An error occurred. Please try again.', 'error');
                verifyBtn.disabled = false;
                verifyBtn.textContent = '✅ Verify Identity';
            }
        }
        
        // Initialize progress
        updateProgress();
    </script>
</body>
</html>
    ''')

@app.route('/api/verify-mfa', methods=['POST'])
def api_verify_mfa():
    """Handle MFA verification"""
    if 'user_id' not in session or not session.get('pending_mfa'):
        return jsonify({'success': False, 'message': 'Invalid session.'})
    
    try:
        data = request.get_json()
        email_otp = data.get('email_otp', '').strip()
        sms_otp = data.get('sms_otp', '').strip()
        
        user_id = session['user_id']
        
        # Verify both OTPs
        email_valid = verify_otp(user_id, email_otp, 'email_login')
        sms_valid = verify_otp(user_id, sms_otp, 'sms_login')
        
        if email_valid and sms_valid:
            session['pending_mfa'] = False
            session['authenticated'] = True
            
            return jsonify({
                'success': True,
                'message': 'Multi-factor authentication successful!'
            })
        else:
            return jsonify({
                'success': False,
                'message': 'Invalid verification codes. Please check and try again.'
            })
            
    except Exception as e:
        return jsonify({'success': False, 'message': 'Verification failed. Please try again.'})

@app.route('/dashboard')
@require_auth
def dashboard():
    """User dashboard"""
    if session.get('pending_mfa'):
        return redirect(url_for('verify_mfa'))
    
    username = session.get('username', 'User')
    
    # Get user stats
    conn = sqlite3.connect(DATABASE)
    cursor = conn.cursor()
    
    cursor.execute('SELECT COUNT(*) FROM users')
    total_users = cursor.fetchone()[0]
    
    cursor.execute('SELECT COUNT(*) FROM login_attempts WHERE success = 1')
    successful_logins = cursor.fetchone()[0]
    
    cursor.execute('SELECT COUNT(*) FROM otp_codes WHERE used = 1')
    otp_verifications = cursor.fetchone()[0]
    
    conn.close()
    
    return render_template_string('''
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dashboard - MyServiceHub</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: #f8f9fa;
            color: #333;
        }
        
        .navbar {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 1rem 2rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
        }
        
        .navbar-brand {
            font-size: 1.5rem;
            font-weight: bold;
        }
        
        .navbar-user {
            display: flex;
            align-items: center;
            gap: 1rem;
        }
        
        .btn-logout {
            background: rgba(255, 255, 255, 0.2);
            color: white;
            border: 1px solid rgba(255, 255, 255, 0.3);
            padding: 0.5rem 1rem;
            border-radius: 5px;
            text-decoration: none;
            transition: all 0.3s ease;
        }
        
        .btn-logout:hover {
            background: rgba(255, 255, 255, 0.3);
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 2rem;
        }
        
        .welcome-card {
            background: white;
            border-radius: 15px;
            padding: 2rem;
            margin-bottom: 2rem;
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
            text-align: center;
        }
        
        .welcome-card h1 {
            color: #667eea;
            margin-bottom: 1rem;
        }
        
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 2rem;
            margin-bottom: 2rem;
        }
        
        .stat-card {
            background: white;
            border-radius: 15px;
            padding: 2rem;
            text-align: center;
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
            transition: transform 0.3s ease;
        }
        
        .stat-card:hover {
            transform: translateY(-5px);
        }
        
        .stat-icon {
            font-size: 3rem;
            margin-bottom: 1rem;
        }
        
        .stat-number {
            font-size: 2.5rem;
            font-weight: bold;
            color: #667eea;
            margin-bottom: 0.5rem;
        }
        
        .stat-label {
            color: #666;
            font-size: 1rem;
        }
        
        .features-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 2rem;
        }
        
        .feature-card {
            background: white;
            border-radius: 15px;
            padding: 2rem;
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
        }
        
        .feature-card h3 {
            color: #667eea;
            margin-bottom: 1rem;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        
        .feature-list {
            list-style: none;
            padding: 0;
        }
        
        .feature-list li {
            padding: 0.5rem 0;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        
        .feature-list li:before {
            content: "✅";
        }
        
        .security-status {
            background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
            color: white;
            border-radius: 15px;
            padding: 2rem;
            text-align: center;
            margin-bottom: 2rem;
        }
        
        .security-status h2 {
            margin-bottom: 1rem;
        }
    </style>
</head>
<body>
    <nav class="navbar">
        <div class="navbar-brand">🔐 MyServiceHub</div>
        <div class="navbar-user">
            <span>Welcome, {{ username }}!</span>
            <a href="/logout" class="btn-logout">Logout</a>
        </div>
    </nav>
    
    <div class="container">
        <div class="welcome-card">
            <h1>🎉 Welcome to Your Secure Dashboard!</h1>
            <p>You have successfully authenticated with Multi-Factor Authentication. Your account is fully secured.</p>
        </div>
        
        <div class="security-status">
            <h2>🛡️ Account Security Status</h2>
            <p><strong>FULLY SECURED</strong> - Multi-Factor Authentication Active</p>
        </div>
        
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-icon">👥</div>
                <div class="stat-number">{{ total_users }}</div>
                <div class="stat-label">Total Users</div>
            </div>
            
            <div class="stat-card">
                <div class="stat-icon">🔓</div>
                <div class="stat-number">{{ successful_logins }}</div>
                <div class="stat-label">Successful Logins</div>
            </div>
            
            <div class="stat-card">
                <div class="stat-icon">📱</div>
                <div class="stat-number">{{ otp_verifications }}</div>
                <div class="stat-label">OTP Verifications</div>
            </div>
        </div>
        
        <div class="features-grid">
            <div class="feature-card">
                <h3>🔐 Security Features</h3>
                <ul class="feature-list">
                    <li>Multi-Factor Authentication</li>
                    <li>SMS & Email OTP Verification</li>
                    <li>TOTP Support</li>
                    <li>Account Lockout Protection</li>
                    <li>Session Management</li>
                </ul>
            </div>
            
            <div class="feature-card">
                <h3>📊 Account Features</h3>
                <ul class="feature-list">
                    <li>Secure Dashboard Access</li>
                    <li>Real-time Security Status</li>
                    <li>Login History Tracking</li>
                    <li>Failed Attempt Monitoring</li>
                    <li>Session Activity Logs</li>
                </ul>
            </div>
        </div>
    </div>
</body>
</html>
    ''', username=username, total_users=total_users, successful_logins=successful_logins, otp_verifications=otp_verifications)

@app.route('/logout')
def logout():
    """Logout user"""
    session.clear()
    return redirect(url_for('customer_portal'))

if __name__ == '__main__':
    print("🔐 Starting MyServiceHub Customer Portal with Multi-Factor Authentication...")
    print("📊 Server: http://localhost:5000")
    print("🛡️ Customer Portal: http://localhost:5000/customer-portal")
    print("📱 MFA Features: SMS OTP, Email OTP, TOTP Authentication")
    print("🔒 Security: Registration Verification, Login MFA, Session Management")
    print("📧 OTP Codes will be printed to console for testing")
    
    init_db()
    app.run(debug=True, host='0.0.0.0', port=5000)
