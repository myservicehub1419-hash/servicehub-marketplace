from flask import Flask

app = Flask(__name__)

@app.route('/')
def home():
    return """
    <!DOCTYPE html>
    <html>
    <head>
        <title>My Website</title>
        <style>
            body { 
                font-family: Arial, sans-serif; 
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                text-align: center;
                padding: 50px;
                margin: 0;
            }
            .container {
                background: rgba(255,255,255,0.1);
                padding: 40px;
                border-radius: 15px;
                max-width: 600px;
                margin: 0 auto;
            }
            h1 { font-size: 48px; margin-bottom: 20px; }
            p { font-size: 20px; line-height: 1.6; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🌟 Welcome to My Website!</h1>
            <p>✅ Flask is running successfully!</p>
            <p>🚀 Your website is now live and working!</p>
            <p>📁 Saved in: website folder</p>
        </div>
    </body>
    </html>
    """

@app.route('/about')
def about():
    return """
    <h1 style='text-align: center; color: #4CAF50;'>About Page</h1>
    <p style='text-align: center; font-size: 18px;'>This is your about page!</p>
    """

if __name__ == '__main__':
    print("🚀 Website starting...")
    print("📁 Location: website folder")
    print("🌐 URL: http://localhost:5000")
    app.run(host='127.0.0.1', port=5000, debug=True)
