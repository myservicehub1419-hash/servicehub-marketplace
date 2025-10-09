from flask import Flask, render_template, request, redirect, url_for, session, flash, jsonify
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from flask_mail import Mail, Message
from werkzeug.security import generate_password_hash, check_password_hash
import sqlite3
import pyotp
import qrcode
import io
import base64
from datetime import datetime, timedelta
import secrets
import os
import json

# Import messaging system
from messaging import socketio, init_messaging_db
from messaging import (get_user_conversations, get_messages_for_conversation, 
                      user_has_access_to_conversation, get_existing_conversation, 
                      create_conversation, mark_messages_read)

# Initialize Flask app
app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key-here-change-this-in-production'

# Configure Flask-Mail
app.config['MAIL_SERVER'] = 'smtp.gmail.com'
app.config['MAIL_PORT'] = 587
app.config['MAIL_USE_TLS'] = True
app.config['MAIL_USERNAME'] = 'your-email@gmail.com'  # Replace with your email
app.config['MAIL_PASSWORD'] = 'your-app-password'     # Replace with your app password

# Initialize extensions
mail = Mail(app)
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

# Initialize SocketIO with your app
socketio.init_app(app)

# User class for Flask-Login
class User(UserMixin):
    def __init__(self, id, email, name, user_type='customer'):
        self.id = id
        self.email = email
        self.name = name
        self.user_type = user_type

@login_manager.user_loader
def load_user(user_id):
    conn = sqlite3.connect('myservicehub.db')
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM users WHERE id = ?', (user_id,))
    user_data = cursor.fetchone()
    conn.close()
    
    if user_data:
        return User(user_data[0], user_data[1], user_data[2], user_data[6] if len(user_data) > 6 else 'customer')
    return None

# Database initialization
def init_db():
    conn = sqlite3.connect('myservicehub.db')
    cursor = conn.cursor()
    
    # Users table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            phone TEXT,
            is_verified BOOLEAN DEFAULT FALSE,
            user_type TEXT DEFAULT 'customer',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            otp_secret TEXT,
            verification_token TEXT
        )
    ''')
    
    # Services table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS services (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT,
            price DECIMAL(10,2),
            category TEXT,
            provider_id INTEGER,
            location TEXT,
            rating DECIMAL(3,2) DEFAULT 0.0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (provider_id) REFERENCES users(id)
        )
    ''')
    
    # Orders table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id INTEGER,
            provider_id INTEGER,
            service_id INTEGER,
            status TEXT DEFAULT 'pending',
            total_amount DECIMAL(10,2),
            booking_date TIMESTAMP,
            completion_date TIMESTAMP,
            payment_status TEXT DEFAULT 'pending',
            payment_id TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (customer_id) REFERENCES users(id),
            FOREIGN KEY (provider_id) REFERENCES users(id),
            FOREIGN KEY (service_id) REFERENCES services(id)
        )
    ''')
    
    # Order tracking table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS order_tracking (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER,
            status TEXT,
            message TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (order_id) REFERENCES orders(id)
        )
    ''')
    
    # Payments table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER,
            payment_id TEXT,
            amount DECIMAL(10,2),
            status TEXT,
            payment_method TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (order_id) REFERENCES orders(id)
        )
    ''')
    
    conn.commit()
    conn.close()

# Routes
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/customer-portal')
def customer_portal():
    if 'user_id' not in session:
        return redirect('/login')
    
    if session.get('user_type') != 'customer':
        return redirect('/provider-portal')
    
    # Get customer's recent orders
    orders = get_customer_orders(session['user_id'])
    
    return render_template('customer-portal.html', orders=orders)

@app.route('/provider-portal')
def provider_portal():
    if 'user_id' not in session:
        return redirect('/login')
    
    if session.get('user_type') != 'provider':
        return redirect('/customer-portal')
    
    # Get provider's orders and stats
    orders = get_provider_orders(session['user_id'])
    stats = get_provider_stats(session['user_id'])
    
    return render_template('provider-portal.html', orders=orders, stats=stats)

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        email = request.form['email']
        password = request.form['password']
        
        conn = sqlite3.connect('myservicehub.db')
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM users WHERE email = ?', (email,))
        user_data = cursor.fetchone()
        conn.close()
        
        if user_data and check_password_hash(user_data[3], password):
            session['user_id'] = user_data[0]
            session['email'] = user_data[1]
            session['name'] = user_data[2]
            session['user_type'] = user_data[6] if len(user_data) > 6 else 'customer'
            
            flash('Login successful!', 'success')
            
            if session['user_type'] == 'provider':
                return redirect('/provider-portal')
            else:
                return redirect('/customer-portal')
        else:
            flash('Invalid email or password!', 'error')
    
    return render_template('login.html')

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        email = request.form['email']
        name = request.form['name']
        password = request.form['password']
        phone = request.form.get('phone', '')
        user_type = request.form.get('user_type', 'customer')
        
        # Check if user already exists
        conn = sqlite3.connect('myservicehub.db')
        cursor = conn.cursor()
        cursor.execute('SELECT id FROM users WHERE email = ?', (email,))
        
        if cursor.fetchone():
            flash('Email already registered!', 'error')
            conn.close()
            return render_template('register.html')
        
        # Create new user
        password_hash = generate_password_hash(password)
        verification_token = secrets.token_urlsafe(32)
        
        cursor.execute('''
            INSERT INTO users (email, name, password_hash, phone, user_type, verification_token)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (email, name, password_hash, phone, user_type, verification_token))
        
        user_id = cursor.lastrowid
        conn.commit()
        conn.close()
        
        # Send verification email
        send_verification_email(email, name, verification_token)
        
        flash('Registration successful! Please check your email to verify your account.', 'success')
        return redirect('/login')
    
    return render_template('register.html')

@app.route('/logout')
def logout():
    session.clear()
    flash('You have been logged out.', 'info')
    return redirect('/')

@app.route('/verify/<token>')
def verify_email(token):
    conn = sqlite3.connect('myservicehub.db')
    cursor = conn.cursor()
    cursor.execute('SELECT id FROM users WHERE verification_token = ?', (token,))
    user = cursor.fetchone()
    
    if user:
        cursor.execute('UPDATE users SET is_verified = TRUE, verification_token = NULL WHERE id = ?', (user[0],))
        conn.commit()
        flash('Email verified successfully! You can now login.', 'success')
    else:
        flash('Invalid verification token!', 'error')
    
    conn.close()
    return redirect('/login')

# Messaging routes
@app.route('/messages')
def messages_page():
    if 'user_id' not in session:
        return redirect('/login')
    
    user_id = session['user_id']
    user_type = session.get('user_type', 'customer')
    
    conversations = get_user_conversations(user_id, user_type)
    
    return render_template('messages.html', 
                         conversations=conversations,
                         user_type=user_type)

@app.route('/api/conversations')
def api_conversations():
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    user_id = session['user_id']
    user_type = session.get('user_type', 'customer')
    
    conversations = get_user_conversations(user_id, user_type)
    return jsonify({'conversations': conversations})

@app.route('/api/messages/<int:conversation_id>')
def api_messages(conversation_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    if not user_has_access_to_conversation(session['user_id'], conversation_id):
        return jsonify({'error': 'Access denied'}), 403
    
    messages = get_messages_for_conversation(conversation_id)
    mark_messages_read(conversation_id, session['user_id'])
    
    return jsonify({'messages': messages})

@app.route('/api/start_conversation', methods=['POST'])
def api_start_conversation():
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    data = request.get_json()
    provider_id = data.get('provider_id')
    service_id = data.get('service_id')
    
    customer_id = session['user_id']
    
    # Check if conversation exists
    conversation_id = get_existing_conversation(customer_id, provider_id, service_id)
    
    if not conversation_id:
        conversation_id = create_conversation(customer_id, provider_id, service_id)
    
    return jsonify({
        'success': True,
        'conversation_id': conversation_id
    })

# Enhanced search API
@app.route('/api/search', methods=['POST'])
def enhanced_search():
    try:
        data = request.get_json()
        search_term = data.get('search_term', '')
        filters = data.get('filters', {})
        
        # Build search query
        conn = sqlite3.connect('myservicehub.db')
        cursor = conn.cursor()
        
        query = '''
            SELECT s.*, u.name as provider_name
            FROM services s
            LEFT JOIN users u ON s.provider_id = u.id
            WHERE 1=1
        '''
        params = []
        
        # Search term filter
        if search_term:
            query += ' AND (s.title LIKE ? OR s.description LIKE ?)'
            params.extend([f'%{search_term}%', f'%{search_term}%'])
        
        # Category filter
        if filters.get('category'):
            query += ' AND s.category = ?'
            params.append(filters['category'])
        
        # Location filter
        if filters.get('location'):
            query += ' AND s.location LIKE ?'
            params.append(f'%{filters["location"]}%')
        
        # Price range filter
        price_range = filters.get('priceRange', {})
        if price_range.get('max'):
            query += ' AND s.price <= ?'
            params.append(price_range['max'])
        
        # Rating filter
        if filters.get('rating'):
            query += ' AND s.rating >= ?'
            params.append(filters['rating'])
        
        query += ' ORDER BY s.rating DESC, s.created_at DESC LIMIT 50'
        
        cursor.execute(query, params)
        services = cursor.fetchall()
        conn.close()
        
        # Convert to list of dictionaries
        service_list = []
        for service in services:
            service_dict = {
                'id': service[0],
                'title': service[1],
                'description': service[2],
                'price': service[3],
                'category': service[4],
                'provider_id': service[5],
                'location': service[6],
                'rating': service[7],
                'provider_name': service[9] if len(service) > 9 else 'Unknown'
            }
            service_list.append(service_dict)
        
        return jsonify({
            'success': True,
            'results': service_list,
            'total': len(service_list)
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400

# Order tracking routes
@app.route('/orders')
def orders_page():
    if 'user_id' not in session:
        return redirect('/login')
    
    user_id = session['user_id']
    user_type = session.get('user_type', 'customer')
    
    if user_type == 'customer':
        orders = get_customer_orders(user_id)
    else:
        orders = get_provider_orders(user_id)
    
    return render_template('orders.html', orders=orders, user_type=user_type)

@app.route('/api/order/<int:order_id>/tracking')
def api_order_tracking(order_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    # Verify user has access to this order
    if not user_has_access_to_order(session['user_id'], order_id):
        return jsonify({'error': 'Access denied'}), 403
    
    tracking = get_order_tracking(order_id)
    return jsonify({'tracking': tracking})

@app.route('/api/order/<int:order_id>/update_status', methods=['POST'])
def api_update_order_status(order_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    data = request.get_json()
    new_status = data.get('status')
    message = data.get('message', '')
    
    # Verify user has access to update this order
    if not user_has_access_to_order(session['user_id'], order_id):
        return jsonify({'error': 'Access denied'}), 403
    
    success = update_order_status(order_id, new_status, message, session['user_id'])
    
    if success:
        return jsonify({'success': True})
    else:
        return jsonify({'error': 'Failed to update order status'}), 400

# Helper functions
def send_verification_email(email, name, token):
    try:
        msg = Message(
            'Verify Your MyServiceHub Account',
            sender=app.config['MAIL_USERNAME'],
            recipients=[email]
        )
        
        verification_url = f"{request.host_url}verify/{token}"
        
        msg.html = f"""
        <h2>Welcome to MyServiceHub, {name}!</h2>
        <p>Please click the link below to verify your email address:</p>
        <a href="{verification_url}" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
            Verify Email
        </a>
        <p>If the button doesn't work, copy and paste this link into your browser:</p>
        <p>{verification_url}</p>
        """
        
        mail.send(msg)
        return True
    except Exception as e:
        print(f"Failed to send email: {e}")
        return False

def get_customer_orders(customer_id):
    conn = sqlite3.connect('myservicehub.db')
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT o.*, s.title as service_title, u.name as provider_name
        FROM orders o
        LEFT JOIN services s ON o.service_id = s.id
        LEFT JOIN users u ON o.provider_id = u.id
        WHERE o.customer_id = ?
        ORDER BY o.created_at DESC
    ''', (customer_id,))
    
    orders = cursor.fetchall()
    conn.close()
    
    return [dict(zip([column[0] for column in cursor.description], row)) for row in orders]

def get_provider_orders(provider_id):
    conn = sqlite3.connect('myservicehub.db')
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT o.*, s.title as service_title, u.name as customer_name
        FROM orders o
        LEFT JOIN services s ON o.service_id = s.id
        LEFT JOIN users u ON o.customer_id = u.id
        WHERE o.provider_id = ?
        ORDER BY o.created_at DESC
    ''', (provider_id,))
    
    orders = cursor.fetchall()
    conn.close()
    
    return [dict(zip([column[0] for column in cursor.description], row)) for row in orders]

def get_provider_stats(provider_id):
    conn = sqlite3.connect('myservicehub.db')
    cursor = conn.cursor()
    
    # Get basic stats
    cursor.execute('SELECT COUNT(*) FROM orders WHERE provider_id = ?', (provider_id,))
    total_orders = cursor.fetchone()[0]
    
    cursor.execute('SELECT COUNT(*) FROM orders WHERE provider_id = ? AND status = "completed"', (provider_id,))
    completed_orders = cursor.fetchone()[0]
    
    cursor.execute('SELECT SUM(total_amount) FROM orders WHERE provider_id = ? AND payment_status = "completed"', (provider_id,))
    total_earnings = cursor.fetchone()[0] or 0
    
    conn.close()
    
    return {
        'total_orders': total_orders,
        'completed_orders': completed_orders,
        'total_earnings': total_earnings,
        'completion_rate': (completed_orders / total_orders * 100) if total_orders > 0 else 0
    }

def get_order_tracking(order_id):
    conn = sqlite3.connect('myservicehub.db')
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT * FROM order_tracking 
        WHERE order_id = ? 
        ORDER BY created_at ASC
    ''', (order_id,))
    
    tracking = cursor.fetchall()
    conn.close()
    
    return [dict(zip([column[0] for column in cursor.description], row)) for row in tracking]

def update_order_status(order_id, status, message, user_id):
    try:
        conn = sqlite3.connect('myservicehub.db')
        cursor = conn.cursor()
        
        # Update order status
        cursor.execute('''
            UPDATE orders 
            SET status = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
        ''', (status, order_id))
        
        # Add tracking entry
        cursor.execute('''
            INSERT INTO order_tracking (order_id, status, message)
            VALUES (?, ?, ?)
        ''', (order_id, status, message))
        
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        print(f"Error updating order status: {e}")
        return False

def user_has_access_to_order(user_id, order_id):
    conn = sqlite3.connect('myservicehub.db')
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT 1 FROM orders 
        WHERE id = ? AND (customer_id = ? OR provider_id = ?)
    ''', (order_id, user_id, user_id))
    
    result = cursor.fetchone()
    conn.close()
    
    return result is not None

# Initialize databases
init_db()
init_messaging_db()

# Error handlers
@app.errorhandler(404)
def not_found(error):
    return render_template('404.html'), 404

@app.errorhandler(500)
def internal_error(error):
    return render_template('500.html'), 500

# Run the application
if __name__ == '__main__':
    # Create upload directory if it doesn't exist
    if not os.path.exists('uploads'):
        os.makedirs('uploads')
    
    # Use socketio.run instead of app.run for messaging support
    socketio.run(app, debug=True, host='127.0.0.1', port=5000)
