from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin
import pyotp
import secrets
import json

db = SQLAlchemy()

class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(100), unique=True, nullable=False)
    password_hash = db.Column(db.String(100), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    phone = db.Column(db.String(20), nullable=True)
    is_verified = db.Column(db.Boolean, default=False)
    user_type = db.Column(db.String(20), default='customer')
    created_at = db.Column(db.DateTime, default=db.func.current_timestamp())
    
    # 2FA fields
    totp_secret = db.Column(db.String(32), nullable=True)
    is_2fa_enabled = db.Column(db.Boolean, default=False)
    backup_codes = db.Column(db.Text, nullable=True)
    
    def get_totp_uri(self):
        return pyotp.totp.TOTP(self.totp_secret).provisioning_uri(
            name=self.email,
            issuer_name="MyServiceHub"
        )
    
    def verify_totp(self, token):
        totp = pyotp.TOTP(self.totp_secret)
        return totp.verify(token, valid_window=1)
    
    def verify_backup_code(self, code):
        if not self.backup_codes:
            return False
        
        codes = json.loads(self.backup_codes)
        if code.upper() in codes:
            codes.remove(code.upper())
            self.backup_codes = json.dumps(codes)
            return True
        return False
    
    def generate_backup_codes(self):
        codes = [secrets.token_hex(4).upper() for _ in range(8)]
        self.backup_codes = json.dumps(codes)
        return codes
    
    def __repr__(self):
        return f'<User {self.email}>'

class Service(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, nullable=False)
    category = db.Column(db.String(100), nullable=False)
    price = db.Column(db.Float, nullable=False)
    provider_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=db.func.current_timestamp())
    
    provider = db.relationship('User', backref=db.backref('services', lazy=True))

class Booking(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    service_id = db.Column(db.Integer, db.ForeignKey('service.id'), nullable=False)
    customer_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    booking_date = db.Column(db.DateTime, nullable=False)
    status = db.Column(db.String(50), default='pending')
    total_amount = db.Column(db.Float, nullable=False)
    created_at = db.Column(db.DateTime, default=db.func.current_timestamp())
    
    service = db.relationship('Service', backref=db.backref('bookings', lazy=True))
    customer = db.relationship('User', backref=db.backref('bookings', lazy=True))
