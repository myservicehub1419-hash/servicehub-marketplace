from flask import request, session, render_template, jsonify, redirect
from flask_socketio import SocketIO, emit, join_room, leave_room, disconnect
from functools import wraps
import sqlite3
from datetime import datetime

# Initialize SocketIO (this will be added to your main app)
socketio = SocketIO(cors_allowed_origins="*")

def init_messaging_db():
    """Initialize messaging database tables"""
    conn = sqlite3.connect('myservicehub.db')
    cursor = conn.cursor()
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id INTEGER,
            provider_id INTEGER,
            service_id INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_message_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            status VARCHAR(20) DEFAULT 'active'
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id INTEGER,
            sender_id INTEGER,
            sender_type VARCHAR(10),
            message TEXT,
            message_type VARCHAR(20) DEFAULT 'text',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            is_read BOOLEAN DEFAULT FALSE,
            FOREIGN KEY (conversation_id) REFERENCES conversations(id)
        )
    ''')
    
    conn.commit()
    conn.close()

# Authentication decorator for SocketIO
def authenticated_only(f):
    @wraps(f)
    def wrapped(*args, **kwargs):
        if 'user_id' not in session:
            disconnect()
        else:
            return f(*args, **kwargs)
    return wrapped

# SocketIO Event Handlers
@socketio.on('connect')
@authenticated_only
def on_connect():
    user_id = session['user_id']
    user_type = session.get('user_type', 'customer')
    
    # Join user to their personal room
    join_room(f"user_{user_id}")
    
    print(f"User {user_id} ({user_type}) connected to messaging")
    emit('status', {'msg': f'{session.get("name", "User")} connected'})

@socketio.on('disconnect')
@authenticated_only
def on_disconnect():
    user_id = session['user_id']
    leave_room(f"user_{user_id}")
    print(f"User {user_id} disconnected from messaging")

@socketio.on('join_conversation')
@authenticated_only
def join_conversation(data):
    conversation_id = data['conversation_id']
    join_room(f"conversation_{conversation_id}")
    
    # Mark messages as read
    mark_messages_read(conversation_id, session['user_id'])
    
    emit('joined_conversation', {
        'conversation_id': conversation_id,
        'status': 'success'
    })

@socketio.on('send_message')
@authenticated_only
def handle_send_message(data):
    conversation_id = data['conversation_id']
    message = data['message'].strip()
    sender_id = session['user_id']
    sender_type = session.get('user_type', 'customer')
    
    if not message:
        return
    
    # Verify user has access to this conversation
    if not user_has_access_to_conversation(sender_id, conversation_id):
        emit('error', {'message': 'Access denied'})
        return
    
    # Save message to database
    message_id = save_message(conversation_id, sender_id, sender_type, message)
    
    # Prepare message data
    message_data = {
        'id': message_id,
        'conversation_id': conversation_id,
        'sender_id': sender_id,
        'sender_type': sender_type,
        'sender_name': session.get('name', 'Unknown'),
        'message': message,
        'timestamp': datetime.now().isoformat(),
        'is_read': False
    }
    
    # Emit to conversation room
    emit('new_message', message_data, room=f"conversation_{conversation_id}")
    
    # Send notification to other party
    other_user_id = get_other_user_in_conversation(conversation_id, sender_id)
    if other_user_id:
        emit('message_notification', {
            'conversation_id': conversation_id,
            'sender_name': session.get('name', 'Someone'),
            'message_preview': message[:50] + '...' if len(message) > 50 else message
        }, room=f"user_{other_user_id}")

@socketio.on('typing')
@authenticated_only
def handle_typing(data):
    conversation_id = data['conversation_id']
    sender_name = session.get('name', 'Someone')
    
    # Broadcast typing indicator to conversation room (except sender)
    emit('user_typing', {
        'sender_name': sender_name,
        'conversation_id': conversation_id
    }, room=f"conversation_{conversation_id}", include_self=False)

@socketio.on('stop_typing')
@authenticated_only
def handle_stop_typing(data):
    conversation_id = data['conversation_id']
    
    emit('user_stop_typing', {
        'conversation_id': conversation_id
    }, room=f"conversation_{conversation_id}", include_self=False)

# Database helper functions
def save_message(conversation_id, sender_id, sender_type, message):
    conn = sqlite3.connect('myservicehub.db')
    cursor = conn.cursor()
    
    cursor.execute('''
        INSERT INTO messages (conversation_id, sender_id, sender_type, message)
        VALUES (?, ?, ?, ?)
    ''', (conversation_id, sender_id, sender_type, message))
    
    message_id = cursor.lastrowid
    
    # Update conversation last_message_at
    cursor.execute('''
        UPDATE conversations SET last_message_at = CURRENT_TIMESTAMP
        WHERE id = ?
    ''', (conversation_id,))
    
    conn.commit()
    conn.close()
    
    return message_id

def get_other_user_in_conversation(conversation_id, current_user_id):
    conn = sqlite3.connect('myservicehub.db')
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT customer_id, provider_id FROM conversations WHERE id = ?
    ''', (conversation_id,))
    
    result = cursor.fetchone()
    conn.close()
    
    if result:
        customer_id, provider_id = result
        return provider_id if current_user_id == customer_id else customer_id
    
    return None

def mark_messages_read(conversation_id, user_id):
    conn = sqlite3.connect('myservicehub.db')
    cursor = conn.cursor()
    
    cursor.execute('''
        UPDATE messages SET is_read = TRUE
        WHERE conversation_id = ? AND sender_id != ? AND is_read = FALSE
    ''', (conversation_id, user_id))
    
    conn.commit()
    conn.close()

def get_user_conversations(user_id, user_type):
    conn = sqlite3.connect('myservicehub.db')
    cursor = conn.cursor()
    
    if user_type == 'customer':
        query = '''
            SELECT c.id, c.provider_id as other_user_id, 
                   COALESCE(u.name, 'Provider') as other_name,
                   COALESCE(s.title, 'Service Inquiry') as service_title, 
                   c.last_message_at,
                   (SELECT COUNT(*) FROM messages m 
                    WHERE m.conversation_id = c.id AND m.sender_id != ? AND m.is_read = FALSE) as unread_count,
                   (SELECT m.message FROM messages m 
                    WHERE m.conversation_id = c.id 
                    ORDER BY m.created_at DESC LIMIT 1) as last_message
            FROM conversations c
            LEFT JOIN users u ON c.provider_id = u.id
            LEFT JOIN services s ON c.service_id = s.id
            WHERE c.customer_id = ?
            ORDER BY c.last_message_at DESC
        '''
        cursor.execute(query, (user_id, user_id))
    else:
        query = '''
            SELECT c.id, c.customer_id as other_user_id,
                   COALESCE(u.name, 'Customer') as other_name,
                   COALESCE(s.title, 'Service Inquiry') as service_title,
                   c.last_message_at,
                   (SELECT COUNT(*) FROM messages m 
                    WHERE m.conversation_id = c.id AND m.sender_id != ? AND m.is_read = FALSE) as unread_count,
                   (SELECT m.message FROM messages m 
                    WHERE m.conversation_id = c.id 
                    ORDER BY m.created_at DESC LIMIT 1) as last_message
            FROM conversations c
            LEFT JOIN users u ON c.customer_id = u.id
            LEFT JOIN services s ON c.service_id = s.id
            WHERE c.provider_id = ?
            ORDER BY c.last_message_at DESC
        '''
        cursor.execute(query, (user_id, user_id))
    
    conversations = cursor.fetchall()
    conn.close()
    
    return [dict(zip([column[0] for column in cursor.description], row)) for row in conversations]

def get_messages_for_conversation(conversation_id):
    conn = sqlite3.connect('myservicehub.db')
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT m.*, COALESCE(u.name, 'Unknown') as sender_name
        FROM messages m
        LEFT JOIN users u ON m.sender_id = u.id
        WHERE m.conversation_id = ?
        ORDER BY m.created_at ASC
    ''', (conversation_id,))
    
    messages = cursor.fetchall()
    conn.close()
    
    return [dict(zip([column[0] for column in cursor.description], row)) for row in messages]

def user_has_access_to_conversation(user_id, conversation_id):
    conn = sqlite3.connect('myservicehub.db')
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT 1 FROM conversations 
        WHERE id = ? AND (customer_id = ? OR provider_id = ?)
    ''', (conversation_id, user_id, user_id))
    
    result = cursor.fetchone()
    conn.close()
    
    return result is not None

def get_existing_conversation(customer_id, provider_id, service_id=None):
    conn = sqlite3.connect('myservicehub.db')
    cursor = conn.cursor()
    
    if service_id:
        cursor.execute('''
            SELECT id FROM conversations 
            WHERE customer_id = ? AND provider_id = ? AND service_id = ?
        ''', (customer_id, provider_id, service_id))
    else:
        cursor.execute('''
            SELECT id FROM conversations 
            WHERE customer_id = ? AND provider_id = ?
            ORDER BY created_at DESC LIMIT 1
        ''', (customer_id, provider_id))
    
    result = cursor.fetchone()
    conn.close()
    
    return result[0] if result else None

def create_conversation(customer_id, provider_id, service_id=None):
    conn = sqlite3.connect('myservicehub.db')
    cursor = conn.cursor()
    
    cursor.execute('''
        INSERT INTO conversations (customer_id, provider_id, service_id)
        VALUES (?, ?, ?)
    ''', (customer_id, provider_id, service_id))
    
    conversation_id = cursor.lastrowid
    conn.commit()
    conn.close()
    
    return conversation_id

# Initialize messaging database
init_messaging_db()
