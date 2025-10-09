from flask import Flask, render_template_string

app = Flask(__name__)

@app.route('/')
def home():
    return render_template_string("""
<!DOCTYPE html>
<html>
<head>
    <title>🎉 SUCCESS - Flask is Working!</title>
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
            background: rgba(255, 255, 255, 0.1);
            padding: 50px;
            border-radius: 20px;
            backdrop-filter: blur(10px);
            display: inline-block;
            box-shadow: 0 20px 40px rgba(0,0,0,0.3);
        }
        h1 { font-size: 3rem; margin-bottom: 20px; }
        p { font-size: 1.5rem; margin: 20px 0; }
        .success { 
            background: rgba(0,255,0,0.2); 
            padding: 20px; 
            border-radius: 10px; 
            margin: 20px 0;
            border: 2px solid rgba(0,255,0,0.5);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="success">
            ✅ <strong>FLASK IS WORKING PERFECTLY!</strong>
        </div>

        <h1>🚀 MyServiceHub</h1>
        <p>Your Flask application is running successfully!</p>
        <p>🌐 Server: <strong>http://localhost:5000</strong></p>
        <p>🎯 No import errors, no dependencies issues!</p>

        <div style="margin-top: 30px; font-size: 1.2rem;">
            <p>✅ Flask: Working</p>
            <p>✅ HTML: Rendering</p>
            <p>✅ CSS: Styling</p>
            <p>✅ Server: Running</p>
        </div>
    </div>
</body>
</html>
    """)

@app.route('/test')
def test():
    return "<h1>✅ Test page working!</h1><p><a href='/'>← Back to home</a></p>"

if __name__ == '__main__':
    print("🎉 SUCCESS! Flask app starting...")
    print("🌐 Open: http://localhost:5000")
    print("🧪 Test: http://localhost:5000/test")
    print("✅ No complex imports needed!")
    app.run(debug=True, host='0.0.0.0', port=5000)