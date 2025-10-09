# security_addon.py - Add this as a separate file
from flask import render_template, request, flash, redirect, url_for, session, jsonify
from flask_login import login_required, current_user
import pyotp
import qrcode
import io
import base64
import json
import secrets
from datetime import datetime, timedelta
import hashlib

# Security Models (Add to existing models.py)
class SecurityLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    action = db.Column(db.String(100), nullable=False)
    ip_address = db.Column(db.String(45), nullable=True)
    user_agent = db.Column(db.String(500), nullable=True)
    success = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=db.func.current_timestamp())

class LoginAttempt(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(100), nullable=False)
    ip_address = db.Column(db.String(45), nullable=True)
    success = db.Column(db.Boolean, default=False)
    attempt_time = db.Column(db.DateTime, default=db.func.current_timestamp())

class SessionToken(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    token = db.Column(db.String(255), unique=True, nullable=False)
    expires_at = db.Column(db.DateTime, nullable=False)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=db.func.current_timestamp())

# Security Helper Functions
def log_security_event(user_id, action, success=True):
    log = SecurityLog(
        user_id=user_id,
        action=action,
        ip_address=request.remote_addr,
        user_agent=request.headers.get('User-Agent'),
        success=success
    )
    db.session.add(log)
    db.session.commit()

def check_login_attempts(email, max_attempts=5, window_minutes=15):
    since = datetime.utcnow() - timedelta(minutes=window_minutes)
    attempts = LoginAttempt.query.filter(
        LoginAttempt.email == email,
        LoginAttempt.success == False,
        LoginAttempt.attempt_time > since
    ).count()
    return attempts < max_attempts

def generate_secure_token():
    return secrets.token_urlsafe(32)

# Security Routes (Add these to your main app.py)
@app.route('/security-dashboard')
@login_required
def security_dashboard():
    # Get user's recent security logs
    logs = SecurityLog.query.filter_by(user_id=current_user.id)\
                           .order_by(SecurityLog.created_at.desc())\
                           .limit(10).all()
    
    # Get active sessions
    active_sessions = SessionToken.query.filter_by(
        user_id=current_user.id,
        is_active=True
    ).filter(SessionToken.expires_at > datetime.utcnow()).all()
    
    return render_template('security/dashboard.html', 
                         logs=logs, 
                         sessions=active_sessions)

@app.route('/password-strength-check', methods=['POST'])
def password_strength_check():
    password = request.json.get('password', '')
    
    score = 0
    feedback = []
    
    # Length check
    if len(password) >= 8:
        score += 1
    else:
        feedback.append('Use at least 8 characters')
    
    # Character variety
    if any(c.isupper() for c in password):
        score += 1
    else:
        feedback.append('Include uppercase letters')
    
    if any(c.islower() for c in password):
        score += 1
    else:
        feedback.append('Include lowercase letters')
    
    if any(c.isdigit() for c in password):
        score += 1
    else:
        feedback.append('Include numbers')
    
    if any(c in '!@#$%^&*()' for c in password):
        score += 1
    else:
        feedback.append('Include special characters')
    
    strength = ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong'][min(score, 4)]
    
    return jsonify({
        'strength': strength,
        'score': score,
        'feedback': feedback
    })

@app.route('/device-management')
@login_required
def device_management():
    # Get user's devices/sessions
    devices = SessionToken.query.filter_by(user_id=current_user.id)\
                               .order_by(SessionToken.created_at.desc()).all()
    
    return render_template('security/devices.html', devices=devices)

@app.route('/revoke-device/<int:token_id>', methods=['POST'])
@login_required
def revoke_device(token_id):
    token = SessionToken.query.filter_by(
        id=token_id, 
        user_id=current_user.id
    ).first()
    
    if token:
        token.is_active = False
        db.session.commit()
        log_security_event(current_user.id, 'Device Revoked')
        flash('Device access revoked successfully.')
    
    return redirect(url_for('device_management'))

@app.route('/security-alerts')
@login_required
def security_alerts():
    # Check for suspicious activities
    recent_logins = LoginAttempt.query.filter_by(
        email=current_user.email
    ).order_by(LoginAttempt.attempt_time.desc()).limit(5).all()
    
    alerts = []
    
    # Check for failed login attempts
    failed_attempts = [login for login in recent_logins if not login.success]
    if len(failed_attempts) > 2:
        alerts.append({
            'type': 'warning',
            'message': f'{len(failed_attempts)} failed login attempts detected',
            'time': failed_attempts[0].attempt_time
        })
    
    return render_template('security/alerts.html', alerts=alerts)

@app.route('/privacy-settings')
@login_required
def privacy_settings():
    return render_template('security/privacy.html')

@app.route('/account-verification-status')
@login_required
def account_verification_status():
    verification_steps = {
        'email_verified': current_user.is_verified,
        'phone_verified': bool(current_user.phone),
        '2fa_enabled': getattr(current_user, 'is_2fa_enabled', False),
        'strong_password': True  # You can add password strength validation
    }
    
    completion = sum(verification_steps.values()) / len(verification_steps) * 100
    
    return render_template('security/verification.html', 
                         steps=verification_steps,
                         completion=completion)
