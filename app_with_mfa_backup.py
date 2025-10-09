from flask import Flask, request, jsonify, send_from_directory, session
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
import json
import os
from datetime import datetime, timedelta
import uuid
import secrets
import sqlite3
import smtplib
from email.mime.text import MimeText
from email.mime.multipart import MimeMultipart
import re
import pyotp
import qrcode
import io
import base64
import random
import string

app = Flask(__name__)
app.secret_key = secrets.token_hex(32)
CORS(app, supports_credentials=True)

# Configuration
UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'pdf', 'doc', 'docx'}
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# MFA Configuration
MFA_CONFIG = {
    'SMS_ENABLED': True,
    'EMAIL_ENABLED': True,
    'TOTP_ENABLED': True,
    'OTP_VALIDITY_MINUTES': 5,
    'MAX_OTP_ATTEMPTS': 3
}

# Twilio Configuration (replace with your credentials)
TWILIO_CONFIG = {
    'ACCOUNT_SID': 'your_twilio_account_sid',
    'AUTH_TOKEN': 'your_twilio_auth_token',
    'PHONE_NUMBER': '+1234567890'  # Your Twilio phone number
}

# Email Configuration (replace with your SMTP settings)
EMAIL_CONFIG = {
    'SMTP_SERVER': 'smtp.gmail.com',
    'SMTP_PORT': 587,
    'EMAIL': 'your_email@gmail.com',
    'PASSWORD': 'your_app_password'
}

# Ensure directories exist
os.makedirs('data', exist_ok=True)
os.makedirs('uploads', exist_ok=True)
os.makedirs('static', exist_ok=True)

# Initialize Twilio client (optional - for production SMS)
try:
    from twilio.rest import Client
    twilio_client = Client(TWILIO_CONFIG['ACCOUNT_SID'], TWILIO_CONFIG['AUTH_TOKEN'])
except:
    twilio_client = None
    print("Warning: Twilio not configured - using simulated SMS")

# Enhanced Database initialization with MFA tables
def init_db():
    conn = sqlite3.connect('data/myservicehub.db')
    cursor = conn.cursor()
    
    # Users table with MFA fields
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT DEFAULT 'customer',
            full_name TEXT,
            phone TEXT,
            address TEXT,
            city TEXT,
            pincode TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            is_verified BOOLEAN DEFAULT FALSE,
            verification_token TEXT,
            mfa_enabled BOOLEAN DEFAULT TRUE,
            mfa_secret TEXT,
            backup_codes TEXT,
            last_login TIMESTAMP
        )
    ''')
    
    # MFA tokens table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS mfa_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            token_type TEXT NOT NULL,
            token_value TEXT NOT NULL,
            token_hash TEXT NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            attempts INTEGER DEFAULT 0,
            is_used BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    ''')
    
    # Login attempts table for security
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS login_attempts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT,
            ip_address TEXT,
            success BOOLEAN,
            attempt_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            user_agent TEXT,
            mfa_step TEXT
        )
    ''')
    
    # Service providers table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS service_providers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            business_name TEXT NOT NULL,
            business_type TEXT,
            experience INTEGER,
            description TEXT,
            services TEXT,
            service_radius INTEGER DEFAULT 10,
            rating REAL DEFAULT 0.0,
            total_reviews INTEGER DEFAULT 0,
            status TEXT DEFAULT 'pending',
            plan_type TEXT,
            plan_price REAL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    ''')
    
    # Services table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS services (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            provider_id INTEGER,
            title TEXT NOT NULL,
            description TEXT,
            category TEXT,
            price REAL,
            duration INTEGER,
            availability TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (provider_id) REFERENCES service_providers (id)
        )
    ''')
    
    # Bookings table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS bookings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id INTEGER,
            provider_id INTEGER,
            service_id INTEGER,
            booking_date DATE,
            booking_time TIME,
            status TEXT DEFAULT 'pending',
            total_amount REAL,
            payment_status TEXT DEFAULT 'pending',
            payment_id TEXT,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (customer_id) REFERENCES users (id),
            FOREIGN KEY (provider_id) REFERENCES service_providers (id),
            FOREIGN KEY (service_id) REFERENCES services (id)
        )
    ''')
    
    # Reviews table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS reviews (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            booking_id INTEGER,
            customer_id INTEGER,
            provider_id INTEGER,
            rating INTEGER CHECK (rating >= 1 AND rating <= 5),
            review_text TEXT,
            photos TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (booking_id) REFERENCES bookings (id),
            FOREIGN KEY (customer_id) REFERENCES users (id),
            FOREIGN KEY (provider_id) REFERENCES service_providers (id)
        )
    ''')
    
    # Notifications table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            type TEXT DEFAULT 'info',
            is_read BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    ''')
    
    # Payments table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            booking_id INTEGER,
            user_id INTEGER,
            amount REAL NOT NULL,
            payment_method TEXT,
            payment_id TEXT,
            transaction_id TEXT,
            status TEXT DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (booking_id) REFERENCES bookings (id),
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    ''')
    
    conn.commit()
    conn.close()

# Utility functions
def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def generate_otp(length=6):
    """Generate numeric OTP"""
    return ''.join(random.choices(string.digits, k=length))

def generate_backup_codes(count=10):
    """Generate backup codes for account recovery"""
    codes = []
    for _ in range(count):
        code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))
        codes.append(f"{code[:4]}-{code[4:]}")
    return codes

def send_sms_otp(phone, otp):
    """Send OTP via SMS using Twilio"""
    try:
        if not twilio_client:
            # Simulated SMS for testing
            print(f"📱 SMS OTP sent to {phone}: {otp}")
            return True
            
        message = twilio_client.messages.create(
            body=f"Your MyServiceHub verification code is: {otp}. Valid for 5 minutes.",
            from_=TWILIO_CONFIG['PHONE_NUMBER'],
            to=phone
        )
        print(f"📱 SMS sent to {phone}: {otp}")
        return True
    except Exception as e:
        print(f"SMS Error: {e}")
        # Fallback to console for testing
        print(f"📱 SMS OTP (simulated) to {phone}: {otp}")
        return True

def send_email_otp(email, otp, purpose="login"):
    """Send OTP via Email"""
    try:
        # For testing - print to console
        print(f"📧 EMAIL OTP sent to {email}: {otp} (Purpose: {purpose})")
        
        # Uncomment below for actual email sending in production
        """
        msg = MimeMultipart()
        msg['From'] = EMAIL_CONFIG['EMAIL']
        msg['To'] = email
        msg['Subject'] = f"MyServiceHub - Verification Code for {purpose.title()}"
        
        body = f'''
        <html>
        <body>
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8f9fa; border-radius: 10px;">
                <div style="text-align: center; margin-bottom: 30px;">
                    <h2 style="color: #667eea; margin-bottom: 10px;">MyServiceHub</h2>
                    <h3 style="color: #333;">Verification Code</h3>
                </div>
                
                <div style="background: white; padding: 30px; border-radius: 8px; text-align: center; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                    <p style="font-size: 16px; color: #333; margin-bottom: 20px;">
                        Your verification code for {purpose} is:
                    </p>
                    
                    <div style="background: #667eea; color: white; font-size: 32px; font-weight: bold; padding: 20px; border-radius: 8px; letter-spacing: 5px; margin: 20px 0;">
                        {otp}
                    </div>
                    
                    <p style="color: #666; font-size: 14px; margin-top: 20px;">
                        This code will expire in 5 minutes. If you didn't request this code, please ignore this email.
                    </p>
                </div>
                
                <div style="text-align: center; margin-top: 20px; color: #999; font-size: 12px;">
                    <p>© 2025 MyServiceHub. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
        '''
        
        msg.attach(MimeText(body, 'html'))
        
        server = smtplib.SMTP(EMAIL_CONFIG['SMTP_SERVER'], EMAIL_CONFIG['SMTP_PORT'])
        server.starttls()
        server.login(EMAIL_CONFIG['EMAIL'], EMAIL_CONFIG['PASSWORD'])
        text = msg.as_string()
        server.sendmail(EMAIL_CONFIG['EMAIL'], email, text)
        server.quit()
        """
        
        return True
        
    except Exception as e:
        print(f"Email Error: {e}")
        # Fallback to console for testing
        print(f"📧 EMAIL OTP (simulated) to {email}: {otp}")
        return True

def create_notification(user_id, title, message, type='info'):
    conn = sqlite3.connect('data/myservicehub.db')
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO notifications (user_id, title, message, type)
        VALUES (?, ?, ?, ?)
    ''', (user_id, title, message, type))
    conn.commit()
    conn.close()

def create_mfa_token(user_id, token_type, token_value):
    """Create and store MFA token in database"""
    conn = sqlite3.connect('data/myservicehub.db')
    cursor = conn.cursor()
    
    # Hash the token for security
    token_hash = generate_password_hash(token_value)
    expires_at = datetime.now() + timedelta(minutes=MFA_CONFIG['OTP_VALIDITY_MINUTES'])
    
    # Clean old tokens for this user and type
    cursor.execute('''
        DELETE FROM mfa_tokens 
        WHERE user_id = ? AND token_type = ? AND expires_at < ?
    ''', (user_id, token_type, datetime.now()))
    
    # Insert new token
    cursor.execute('''
        INSERT INTO mfa_tokens (user_id, token_type, token_value, token_hash, expires_at)
        VALUES (?, ?, ?, ?, ?)
    ''', (user_id, token_type, token_value, token_hash, expires_at))
    
    token_id = cursor.lastrowid
    conn.commit()
    conn.close()
    
    return token_id

def verify_mfa_token(user_id, token_type, token_value):
    """Verify MFA token"""
    conn = sqlite3.connect('data/myservicehub.db')
    cursor = conn.cursor()
    
    # Get valid token
    cursor.execute('''
        SELECT id, token_hash, attempts, is_used, expires_at
        FROM mfa_tokens 
        WHERE user_id = ? AND token_type = ? AND expires_at > ? AND is_used = FALSE
        ORDER BY created_at DESC LIMIT 1
    ''', (user_id, token_type, datetime.now()))
    
    token_data = cursor.fetchone()
    
    if not token_data:
        conn.close()
        return False, "Invalid or expired token"
    
    token_id, token_hash, attempts, is_used, expires_at = token_data
    
    # Check attempt limit
    if attempts >= MFA_CONFIG['MAX_OTP_ATTEMPTS']:
        conn.close()
        return False, "Maximum attempts exceeded"
    
    # Verify token
    if check_password_hash(token_hash, token_value):
        # Mark token as used
        cursor.execute('''
            UPDATE mfa_tokens SET is_used = TRUE WHERE id = ?
        ''', (token_id,))
        conn.commit()
        conn.close()
        return True, "Token verified successfully"
    else:
        # Increment attempts
        cursor.execute('''
            UPDATE mfa_tokens SET attempts = attempts + 1 WHERE id = ?
        ''', (token_id,))
        conn.commit()
        conn.close()
        return False, "Invalid token"

def log_login_attempt(email, ip_address, success, user_agent="", mfa_step=""):
    """Log login attempts for security monitoring"""
    conn = sqlite3.connect('data/myservicehub.db')
    cursor = conn.cursor()
    
    cursor.execute('''
        INSERT INTO login_attempts (email, ip_address, success, user_agent, mfa_step)
        VALUES (?, ?, ?, ?, ?)
    ''', (email, ip_address, success, user_agent, mfa_step))
    
    conn.commit()
    conn.close()

# Enhanced Authentication Routes with MFA

@app.route('/api/register', methods=['POST'])
def register():
    try:
        data = request.get_json()
        
        # Validation
        required_fields = ['username', 'email', 'password', 'full_name', 'phone']
        if not all(field in data for field in required_fields):
            return jsonify({'success': False, 'error': 'Missing required fields'}), 400
        
        # Email validation
        email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        if not re.match(email_pattern, data['email']):
            return jsonify({'success': False, 'error': 'Invalid email format'}), 400
        
        # Phone validation (basic)
        phone_pattern = r'^\+?[1-9]\d{9,14}$'
        if not re.match(phone_pattern, data['phone'].replace(' ', '').replace('-', '')):
            return jsonify({'success': False, 'error': 'Invalid phone number format'}), 400
        
        conn = sqlite3.connect('data/myservicehub.db')
        cursor = conn.cursor()
        
        # Check if user exists
        cursor.execute('SELECT id FROM users WHERE username = ? OR email = ? OR phone = ?', 
                      (data['username'], data['email'], data['phone']))
        if cursor.fetchone():
            conn.close()
            return jsonify({'success': False, 'error': 'User already exists'}), 409
        
        # Create user
        password_hash = generate_password_hash(data['password'])
        verification_token = secrets.token_urlsafe(32)
        
        cursor.execute('''
            INSERT INTO users (username, email, password_hash, full_name, phone, 
                             address, city, pincode, role, verification_token, mfa_enabled)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (data['username'], data['email'], password_hash, data['full_name'], 
              data['phone'], data.get('address', ''), data.get('city', ''), 
              data.get('pincode', ''), data.get('role', 'customer'), verification_token, True))
        
        user_id = cursor.lastrowid
        conn.commit()
        conn.close()
        
        # Send verification email with OTP
        email_otp = generate_otp()
        create_mfa_token(user_id, 'email_verification', email_otp)
        send_email_otp(data['email'], email_otp, "account verification")
        
        # Send SMS OTP
        sms_otp = generate_otp()
        create_mfa_token(user_id, 'sms_verification', sms_otp)
        send_sms_otp(data['phone'], sms_otp)
        
        session['temp_user_id'] = user_id
        session['mfa_step'] = 'verification'
        
        return jsonify({
            'success': True,
            'message': 'Registration successful! Please verify your email and phone number.',
            'user_id': user_id,
            'requires_verification': True
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/verify-registration', methods=['POST'])
def verify_registration():
    try:
        data = request.get_json()
        
        if 'temp_user_id' not in session:
            return jsonify({'success': False, 'error': 'No pending verification'}), 400
        
        user_id = session['temp_user_id']
        email_otp = data.get('email_otp')
        sms_otp = data.get('sms_otp')
        
        if not email_otp or not sms_otp:
            return jsonify({'success': False, 'error': 'Both email and SMS OTP required'}), 400
        
        # Verify email OTP
        email_valid, email_msg = verify_mfa_token(user_id, 'email_verification', email_otp)
        if not email_valid:
            return jsonify({'success': False, 'error': f'Email OTP: {email_msg}'}), 400
        
        # Verify SMS OTP
        sms_valid, sms_msg = verify_mfa_token(user_id, 'sms_verification', sms_otp)
        if not sms_valid:
            return jsonify({'success': False, 'error': f'SMS OTP: {sms_msg}'}), 400
        
        # Both OTPs verified, activate user
        conn = sqlite3.connect('data/myservicehub.db')
        cursor = conn.cursor()
        
        cursor.execute('''
            UPDATE users SET is_verified = TRUE WHERE id = ?
        ''', (user_id,))
        
        # Get user details
        cursor.execute('''
            SELECT username, email, full_name, role FROM users WHERE id = ?
        ''', (user_id,))
        
        user_data = cursor.fetchone()
        conn.commit()
        conn.close()
        
        # Clear temp session
        session.pop('temp_user_id', None)
        session.pop('mfa_step', None)
        
        # Create welcome notification
        create_notification(user_id, 'Welcome!', 'Welcome to MyServiceHub! Your account has been verified successfully.')
        
        return jsonify({
            'success': True,
            'message': 'Account verified successfully! You can now login.',
            'user': {
                'id': user_id,
                'username': user_data[0],
                'email': user_data[1],
                'full_name': user_data[2],
                'role': user_data[3]
            }
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/resend-verification-otp', methods=['POST'])
def resend_verification_otp():
    try:
        data = request.get_json()
        otp_type = data.get('type')  # 'email' or 'sms'
        
        if 'temp_user_id' not in session:
            return jsonify({'success': False, 'error': 'No pending verification'}), 400
        
        user_id = session['temp_user_id']
        
        # Get user details
        conn = sqlite3.connect('data/myservicehub.db')
        cursor = conn.cursor()
        cursor.execute('SELECT email, phone FROM users WHERE id = ?', (user_id,))
        user_data = cursor.fetchone()
        conn.close()
        
        if not user_data:
            return jsonify({'success': False, 'error': 'User not found'}), 404
        
        email, phone = user_data
        
        if otp_type == 'email':
            email_otp = generate_otp()
            create_mfa_token(user_id, 'email_verification', email_otp)
            send_email_otp(email, email_otp, "account verification")
            message = "Email OTP resent successfully"
        elif otp_type == 'sms':
            sms_otp = generate_otp()
            create_mfa_token(user_id, 'sms_verification', sms_otp)
            send_sms_otp(phone, sms_otp)
            message = "SMS OTP resent successfully"
        else:
            return jsonify({'success': False, 'error': 'Invalid OTP type'}), 400
        
        return jsonify({'success': True, 'message': message})
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/login', methods=['POST'])
def login():
    try:
        data = request.get_json()
        
        if not data.get('email') or not data.get('password'):
            return jsonify({'success': False, 'error': 'Email and password required'}), 400
        
        ip_address = request.environ.get('HTTP_X_REAL_IP', request.remote_addr)
        user_agent = request.headers.get('User-Agent', '')
        
        conn = sqlite3.connect('data/myservicehub.db')
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT id, username, email, password_hash, role, full_name, is_verified, 
                   phone, mfa_enabled
            FROM users WHERE email = ?
        ''', (data['email'],))
        
        user = cursor.fetchone()
        
        if not user or not check_password_hash(user[3], data['password']):
            log_login_attempt(data['email'], ip_address, False, user_agent, 'password')
            conn.close()
            return jsonify({'success': False, 'error': 'Invalid credentials'}), 401
        
        if not user[6]:  # is_verified
            conn.close()
            return jsonify({'success': False, 'error': 'Please verify your account first'}), 401
        
        user_id, username, email, password_hash, role, full_name, is_verified, phone, mfa_enabled = user
        
        # Check if MFA is enabled
        if mfa_enabled:
            # Generate and send OTP
            email_otp = generate_otp()
            sms_otp = generate_otp()
            
            create_mfa_token(user_id, 'email_login', email_otp)
            create_mfa_token(user_id, 'sms_login', sms_otp)
            
            send_email_otp(email, email_otp, "login")
            send_sms_otp(phone, sms_otp)
            
            # Store in session for MFA verification
            session['temp_login_user_id'] = user_id
            session['mfa_step'] = 'login_verification'
            
            log_login_attempt(email, ip_address, False, user_agent, 'mfa_required')
            conn.close()
            
            return jsonify({
                'success': False,
                'requires_mfa': True,
                'message': 'MFA required. Check your email and phone for verification codes.',
                'mfa_methods': ['email', 'sms']
            })
        else:
            # No MFA required, log in directly
            session['user_id'] = user_id
            session['username'] = username
            session['role'] = role
            
            # Update last login
            cursor.execute('UPDATE users SET last_login = ? WHERE id = ?', 
                          (datetime.now(), user_id))
            conn.commit()
            conn.close()
            
            log_login_attempt(email, ip_address, True, user_agent, 'success')
            
            return jsonify({
                'success': True,
                'user': {
                    'id': user_id,
                    'username': username,
                    'email': email,
                    'role': role,
                    'full_name': full_name,
                    'mfa_enabled': mfa_enabled
                }
            })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/verify-login-mfa', methods=['POST'])
def verify_login_mfa():
    try:
        data = request.get_json()
        
        if 'temp_login_user_id' not in session:
            return jsonify({'success': False, 'error': 'No pending MFA verification'}), 400
        
        user_id = session['temp_login_user_id']
        email_otp = data.get('email_otp')
        sms_otp = data.get('sms_otp')
        totp_code = data.get('totp_code')
        
        ip_address = request.environ.get('HTTP_X_REAL_IP', request.remote_addr)
        user_agent = request.headers.get('User-Agent', '')
        
        conn = sqlite3.connect('data/myservicehub.db')
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT username, email, role, full_name, mfa_enabled, mfa_secret 
            FROM users WHERE id = ?
        ''', (user_id,))
        
        user_data = cursor.fetchone()
        if not user_data:
            conn.close()
            return jsonify({'success': False, 'error': 'User not found'}), 404
        
        username, email, role, full_name, mfa_enabled, mfa_secret = user_data
        
        # Verify provided MFA methods
        verification_success = False
        
        if email_otp and sms_otp:
            # Verify both email and SMS OTP
            email_valid, email_msg = verify_mfa_token(user_id, 'email_login', email_otp)
            sms_valid, sms_msg = verify_mfa_token(user_id, 'sms_login', sms_otp)
            
            if email_valid and sms_valid:
                verification_success = True
            else:
                errors = []
                if not email_valid:
                    errors.append(f"Email OTP: {email_msg}")
                if not sms_valid:
                    errors.append(f"SMS OTP: {sms_msg}")
                    
                log_login_attempt(email, ip_address, False, user_agent, 'mfa_failed')
                conn.close()
                return jsonify({'success': False, 'error': '; '.join(errors)}), 400
        
        elif totp_code and mfa_secret:
            # Verify TOTP
            totp = pyotp.TOTP(mfa_secret)
            if totp.verify(totp_code, valid_window=1):
                verification_success = True
            else:
                log_login_attempt(email, ip_address, False, user_agent, 'totp_failed')
                conn.close()
                return jsonify({'success': False, 'error': 'Invalid TOTP code'}), 400
        
        if verification_success:
            # MFA verified, complete login
            session.pop('temp_login_user_id', None)
            session.pop('mfa_step', None)
            
            session['user_id'] = user_id
            session['username'] = username
            session['role'] = role
            
            # Update last login
            cursor.execute('UPDATE users SET last_login = ? WHERE id = ?', 
                          (datetime.now(), user_id))
            conn.commit()
            conn.close()
            
            log_login_attempt(email, ip_address, True, user_agent, 'mfa_success')
            
            return jsonify({
                'success': True,
                'message': 'Login successful!',
                'user': {
                    'id': user_id,
                    'username': username,
                    'email': email,
                    'role': role,
                    'full_name': full_name,
                    'mfa_enabled': mfa_enabled
                }
            })
        else:
            conn.close()
            return jsonify({'success': False, 'error': 'Invalid MFA verification'}), 400
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/resend-login-otp', methods=['POST'])
def resend_login_otp():
    try:
        data = request.get_json()
        otp_type = data.get('type')  # 'email' or 'sms'
        
        if 'temp_login_user_id' not in session:
            return jsonify({'success': False, 'error': 'No pending MFA verification'}), 400
        
        user_id = session['temp_login_user_id']
        
        # Get user details
        conn = sqlite3.connect('data/myservicehub.db')
        cursor = conn.cursor()
        cursor.execute('SELECT email, phone FROM users WHERE id = ?', (user_id,))
        user_data = cursor.fetchone()
        conn.close()
        
        if not user_data:
            return jsonify({'success': False, 'error': 'User not found'}), 404
        
        email, phone = user_data
        
        if otp_type == 'email':
            email_otp = generate_otp()
            create_mfa_token(user_id, 'email_login', email_otp)
            send_email_otp(email, email_otp, "login")
            message = "Email OTP resent successfully"
        elif otp_type == 'sms':
            sms_otp = generate_otp()
            create_mfa_token(user_id, 'sms_login', sms_otp)
            send_sms_otp(phone, sms_otp)
            message = "SMS OTP resent successfully"
        else:
            return jsonify({'success': False, 'error': 'Invalid OTP type'}), 400
        
        return jsonify({'success': True, 'message': message})
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/setup-mfa', methods=['POST'])
def setup_mfa():
    try:
        if 'user_id' not in session:
            return jsonify({'success': False, 'error': 'Please login first'}), 401
        
        data = request.get_json()
        mfa_type = data.get('type')  # 'enable', 'disable', 'generate_totp'
        
        conn = sqlite3.connect('data/myservicehub.db')
        cursor = conn.cursor()
        
        cursor.execute('SELECT email, mfa_enabled, mfa_secret FROM users WHERE id = ?', 
                      (session['user_id'],))
        user_data = cursor.fetchone()
        
        if not user_data:
            conn.close()
            return jsonify({'success': False, 'error': 'User not found'}), 404
        
        email, mfa_enabled, mfa_secret = user_data
        
        if mfa_type == 'generate_totp':
            # Generate new TOTP secret
            secret = pyotp.random_base32()
            totp = pyotp.TOTP(secret)
            
            # Generate QR code
            provisioning_uri = totp.provisioning_uri(
                name=email,
                issuer_name="MyServiceHub"
            )
            
            qr = qrcode.QRCode(version=1, box_size=10, border=5)
            qr.add_data(provisioning_uri)
            qr.make(fit=True)
            
            qr_img = qr.make_image(fill_color="black", back_color="white")
            
            # Convert QR code to base64
            buffer = io.BytesIO()
            qr_img.save(buffer, format='PNG')
            qr_code_data = base64.b64encode(buffer.getvalue()).decode()
            
            # Store secret temporarily (not enabled until verified)
            cursor.execute('''
                UPDATE users SET mfa_secret = ? WHERE id = ?
            ''', (secret, session['user_id']))
            conn.commit()
            conn.close()
            
            return jsonify({
                'success': True,
                'secret': secret,
                'qr_code': f"data:image/png;base64,{qr_code_data}",
                'manual_entry_key': secret
            })
        
        elif mfa_type == 'enable':
            # Verify TOTP code before enabling
            totp_code = data.get('totp_code')
            if not totp_code:
                conn.close()
                return jsonify({'success': False, 'error': 'TOTP code required'}), 400
            
            if not mfa_secret:
                conn.close()
                return jsonify({'success': False, 'error': 'Generate TOTP secret first'}), 400
            
            # Verify TOTP
            totp = pyotp.TOTP(mfa_secret)
            if not totp.verify(totp_code, valid_window=1):
                conn.close()
                return jsonify({'success': False, 'error': 'Invalid TOTP code'}), 400
            
            # Generate backup codes
            backup_codes = generate_backup_codes()
            backup_codes_json = json.dumps(backup_codes)
            
            # Enable MFA
            cursor.execute('''
                UPDATE users SET mfa_enabled = TRUE, backup_codes = ? WHERE id = ?
            ''', (backup_codes_json, session['user_id']))
            conn.commit()
            conn.close()
            
            return jsonify({
                'success': True,
                'message': 'MFA enabled successfully!',
                'backup_codes': backup_codes
            })
        
        elif mfa_type == 'disable':
            # Verify current password or TOTP before disabling
            password = data.get('password')
            totp_code = data.get('totp_code')
            
            if password:
                cursor.execute('SELECT password_hash FROM users WHERE id = ?', (session['user_id'],))
                password_hash = cursor.fetchone()[0]
                if not check_password_hash(password_hash, password):
                    conn.close()
                    return jsonify({'success': False, 'error': 'Invalid password'}), 400
            elif totp_code and mfa_secret:
                totp = pyotp.TOTP(mfa_secret)
                if not totp.verify(totp_code, valid_window=1):
                    conn.close()
                    return jsonify({'success': False, 'error': 'Invalid TOTP code'}), 400
            else:
                conn.close()
                return jsonify({'success': False, 'error': 'Password or TOTP code required'}), 400
            
            # Disable MFA
            cursor.execute('''
                UPDATE users SET mfa_enabled = FALSE, mfa_secret = NULL, backup_codes = NULL 
                WHERE id = ?
            ''', (session['user_id'],))
            conn.commit()
            conn.close()
            
            return jsonify({
                'success': True,
                'message': 'MFA disabled successfully!'
            })
        
        else:
            conn.close()
            return jsonify({'success': False, 'error': 'Invalid MFA operation'}), 400
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# Service Provider routes
@app.route('/api/provider-registration', methods=['POST'])
def provider_registration():
    try:
        if 'user_id' not in session:
            return jsonify({'success': False, 'error': 'Please login first'}), 401
        
        data = request.get_json()
        
        # Validation
        required_fields = ['business_name', 'business_type', 'services', 'plan_type']
        if not all(field in data for field in required_fields):
            return jsonify({'success': False, 'error': 'Missing required fields'}), 400
        
        conn = sqlite3.connect('data/myservicehub.db')
        cursor = conn.cursor()
        
        # Check if user is already a provider
        cursor.execute('SELECT id FROM service_providers WHERE user_id = ?', (session['user_id'],))
        if cursor.fetchone():
            conn.close()
            return jsonify({'success': False, 'error': 'Already registered as provider'}), 409
        
        # Create provider
        cursor.execute('''
            INSERT INTO service_providers (user_id, business_name, business_type, 
                                         description, services, experience, service_radius,
                                         plan_type, plan_price)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (session['user_id'], data['business_name'], data['business_type'],
              data.get('description', ''), json.dumps(data['services']),
              data.get('experience', 0), data.get('service_radius', 10),
              data['plan_type'], data.get('plan_price', 0)))
        
        provider_id = cursor.lastrowid
        
        # Update user role
        cursor.execute('UPDATE users SET role = ? WHERE id = ?', ('provider', session['user_id']))
        
        conn.commit()
        conn.close()
        
        # Create notification
        create_notification(session['user_id'], 
                          'Registration Submitted', 
                          'Your service provider registration has been submitted for review.')
        
        return jsonify({
            'success': True,
            'message': 'Provider registration successful!',
            'provider_id': provider_id
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# Service routes
@app.route('/api/services', methods=['GET'])
def get_services():
    try:
        conn = sqlite3.connect('data/myservicehub.db')
        cursor = conn.cursor()
        
        # Get query parameters
        category = request.args.get('category')
        city = request.args.get('city')
        search = request.args.get('search')
        min_price = request.args.get('min_price', type=float)
        max_price = request.args.get('max_price', type=float)
        min_rating = request.args.get('min_rating', type=float)
        
        # Build query
        query = '''
            SELECT s.*, sp.business_name, sp.rating, sp.total_reviews, u.city
            FROM services s
            JOIN service_providers sp ON s.provider_id = sp.id
            JOIN users u ON sp.user_id = u.id
            WHERE sp.status = 'active'
        '''
        params = []
        
        if category:
            query += ' AND s.category = ?'
            params.append(category)
        
        if city:
            query += ' AND u.city = ?'
            params.append(city)
        
        if search:
            query += ' AND (s.title LIKE ? OR s.description LIKE ? OR sp.business_name LIKE ?)'
            search_term = f'%{search}%'
            params.extend([search_term, search_term, search_term])
        
        if min_price:
            query += ' AND s.price >= ?'
            params.append(min_price)
        
        if max_price:
            query += ' AND s.price <= ?'
            params.append(max_price)
        
        if min_rating:
            query += ' AND sp.rating >= ?'
            params.append(min_rating)
        
        query += ' ORDER BY sp.rating DESC, s.created_at DESC'
        
        cursor.execute(query, params)
        services = cursor.fetchall()
        conn.close()
        
        # Format results
        service_list = []
        for service in services:
            service_list.append({
                'id': service[0],
                'provider_id': service[1],
                'title': service[2],
                'description': service[3],
                'category': service[4],
                'price': service[5],
                'duration': service[6],
                'availability': service[7],
                'business_name': service[9],
                'rating': service[10],
                'total_reviews': service[11],
                'city': service[12]
            })
        
        return jsonify({'success': True, 'services': service_list})
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# Booking routes
@app.route('/api/book-service', methods=['POST'])
def book_service():
    try:
        if 'user_id' not in session:
            return jsonify({'success': False, 'error': 'Please login first'}), 401
        
        data = request.get_json()
        
        # Validation
        required_fields = ['service_id', 'provider_id', 'booking_date', 'booking_time']
        if not all(field in data for field in required_fields):
            return jsonify({'success': False, 'error': 'Missing required fields'}), 400
        
        conn = sqlite3.connect('data/myservicehub.db')
        cursor = conn.cursor()
        
        # Get service details
        cursor.execute('SELECT price FROM services WHERE id = ?', (data['service_id'],))
        service = cursor.fetchone()
        if not service:
            conn.close()
            return jsonify({'success': False, 'error': 'Service not found'}), 404
        
        # Create booking
        booking_id = str(uuid.uuid4())
        cursor.execute('''
            INSERT INTO bookings (customer_id, provider_id, service_id, booking_date,
                                booking_time, total_amount, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (session['user_id'], data['provider_id'], data['service_id'],
              data['booking_date'], data['booking_time'], service[0], data.get('notes', '')))
        
        booking_db_id = cursor.lastrowid
        conn.commit()
        conn.close()
        
        # Create notifications
        create_notification(session['user_id'], 
                          'Booking Confirmed', 
                          f'Your booking for {data["booking_date"]} has been confirmed.')
        
        return jsonify({
            'success': True,
            'message': 'Booking successful!',
            'booking_id': booking_db_id
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# Review routes
@app.route('/api/add-review', methods=['POST'])
def add_review():
    try:
        if 'user_id' not in session:
            return jsonify({'success': False, 'error': 'Please login first'}), 401
        
        data = request.get_json()
        
        # Validation
        if not all(field in data for field in ['booking_id', 'provider_id', 'rating']):
            return jsonify({'success': False, 'error': 'Missing required fields'}), 400
        
        if not (1 <= data['rating'] <= 5):
            return jsonify({'success': False, 'error': 'Rating must be between 1 and 5'}), 400
        
        conn = sqlite3.connect('data/myservicehub.db')
        cursor = conn.cursor()
        
        # Add review
        cursor.execute('''
            INSERT INTO reviews (booking_id, customer_id, provider_id, rating, review_text)
            VALUES (?, ?, ?, ?, ?)
        ''', (data['booking_id'], session['user_id'], data['provider_id'],
              data['rating'], data.get('review_text', '')))
        
        # Update provider rating
        cursor.execute('''
            UPDATE service_providers 
            SET rating = (
                SELECT AVG(CAST(rating AS FLOAT)) FROM reviews WHERE provider_id = ?
            ),
            total_reviews = (
                SELECT COUNT(*) FROM reviews WHERE provider_id = ?
            )
            WHERE id = ?
        ''', (data['provider_id'], data['provider_id'], data['provider_id']))
        
        conn.commit()
        conn.close()
        
        return jsonify({'success': True, 'message': 'Review added successfully!'})
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# Payment routes
@app.route('/api/process-payment', methods=['POST'])
def process_payment():
    try:
        if 'user_id' not in session:
            return jsonify({'success': False, 'error': 'Please login first'}), 401
        
        data = request.get_json()
        
        # Simulate payment processing
        transaction_id = f"TXN{datetime.now().strftime('%Y%m%d%H%M%S')}{secrets.token_hex(3).upper()}"
        
        conn = sqlite3.connect('data/myservicehub.db')
        cursor = conn.cursor()
        
        # Create payment record
        cursor.execute('''
            INSERT INTO payments (booking_id, user_id, amount, payment_method, 
                                transaction_id, status)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (data.get('booking_id'), session['user_id'], data['amount'],
              data.get('payment_method', 'card'), transaction_id, 'completed'))
        
        # Update booking payment status
        if data.get('booking_id'):
            cursor.execute('''
                UPDATE bookings SET payment_status = ?, payment_id = ? 
                WHERE id = ?
            ''', ('completed', transaction_id, data['booking_id']))
        
        conn.commit()
        conn.close()
        
        return jsonify({
            'success': True,
            'transaction_id': transaction_id,
            'status': 'completed',
            'message': 'Payment processed successfully!'
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# Notification routes
@app.route('/api/notifications', methods=['GET'])
def get_notifications():
    try:
        if 'user_id' not in session:
            return jsonify({'success': False, 'error': 'Please login first'}), 401
        
        conn = sqlite3.connect('data/myservicehub.db')
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT id, title, message, type, is_read, created_at
            FROM notifications WHERE user_id = ?
            ORDER BY created_at DESC LIMIT 50
        ''', (session['user_id'],))
        
        notifications = cursor.fetchall()
        conn.close()
        
        notification_list = []
        for notif in notifications:
            notification_list.append({
                'id': notif[0],
                'title': notif[1],
                'message': notif[2],
                'type': notif[3],
                'is_read': notif[4],
                'created_at': notif[5]
            })
        
        return jsonify({'success': True, 'notifications': notification_list})
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# Dashboard routes
@app.route('/api/dashboard/<user_type>')
def get_dashboard(user_type):
    try:
        if 'user_id' not in session:
            return jsonify({'success': False, 'error': 'Please login first'}), 401
        
        conn = sqlite3.connect('data/myservicehub.db')
        cursor = conn.cursor()
        
        if user_type == 'customer':
            # Customer dashboard
            cursor.execute('''
                SELECT COUNT(*) FROM bookings WHERE customer_id = ?
            ''', (session['user_id'],))
            total_bookings = cursor.fetchone()[0]
            
            cursor.execute('''
                SELECT COUNT(*) FROM bookings 
                WHERE customer_id = ? AND status = 'completed'
            ''', (session['user_id'],))
            completed_bookings = cursor.fetchone()[0]
            
            cursor.execute('''
                SELECT COALESCE(SUM(total_amount), 0) FROM bookings 
                WHERE customer_id = ? AND payment_status = 'completed'
            ''', (session['user_id'],))
            total_spent = cursor.fetchone()[0]
            
            dashboard_data = {
                'total_bookings': total_bookings,
                'completed_bookings': completed_bookings,
                'pending_bookings': total_bookings - completed_bookings,
                'total_spent': total_spent
            }
            
        elif user_type == 'provider':
            # Provider dashboard
            cursor.execute('''
                SELECT COUNT(*) FROM bookings b
                JOIN service_providers sp ON b.provider_id = sp.id
                WHERE sp.user_id = ?
            ''', (session['user_id'],))
            total_bookings = cursor.fetchone()[0]
            
            cursor.execute('''
                SELECT COALESCE(SUM(b.total_amount), 0) FROM bookings b
                JOIN service_providers sp ON b.provider_id = sp.id
                WHERE sp.user_id = ? AND b.payment_status = 'completed'
            ''', (session['user_id'],))
            total_earnings = cursor.fetchone()[0]
            
            cursor.execute('''
                SELECT AVG(CAST(rating AS FLOAT)) FROM service_providers 
                WHERE user_id = ?
            ''', (session['user_id'],))
            avg_rating = cursor.fetchone()[0] or 0
            
            dashboard_data = {
                'total_bookings': total_bookings,
                'total_earnings': total_earnings,
                'average_rating': round(avg_rating, 1)
            }
        
        conn.close()
        return jsonify({'success': True, 'dashboard': dashboard_data})
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'success': True, 'message': 'Logged out successfully'})

# Customer Portal Route
@app.route('/customer-portal')
def customer_portal():
    return send_from_directory('.', 'customer_portal_mfa.html')

# Static file serving
@app.route('/')
def index():
    return send_from_directory('.', 'customer_portal_mfa.html')

@app.route('/<path:filename>')
def serve_static(filename):
    return send_from_directory('.', filename)

@app.route('/api/health')
def health_check():
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now().isoformat(),
        'version': '2.0.0-MFA',
        'mfa_enabled': MFA_CONFIG
    })

# Initialize database and run app
if __name__ == '__main__':
    init_db()
    print("🔐 Starting MyServiceHub Customer Portal with Multi-Factor Authentication...")
    print("📊 Server: http://localhost:5000")
    print("🛡️ Customer Portal: http://localhost:5000/customer-portal")
    print("📱 MFA Features: SMS OTP, Email OTP, TOTP Authentication")
    print("🔒 Security: Registration Verification, Login MFA, Session Management")
    print("📧 OTP Codes will be printed to console for testing")
    app.run(debug=True, host='0.0.0.0', port=5000)
