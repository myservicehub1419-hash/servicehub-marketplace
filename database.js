const mongoose = require('mongoose');

class DatabaseConnection {
    constructor() {
        this.connection = null;
        this.isConnected = false;
    }

    async connect() {
        try {
            // Connection options
            const options = {
                useNewUrlParser: true,
                useUnifiedTopology: true,
                maxPoolSize: 10, // Maximum number of connections
                serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
                socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
                bufferMaxEntries: 0, // Disable mongoose buffering
                bufferCommands: false, // Disable mongoose buffering
            };

            // Connect to MongoDB
            const conn = await mongoose.connect(process.env.MONGODB_URI, options);
            
            this.connection = conn;
            this.isConnected = true;
            
            console.log('✅ MongoDB Connected:', conn.connection.host);
            console.log('📊 Database Name:', conn.connection.name);
            
            return conn;
        } catch (error) {
            console.error('❌ MongoDB connection error:', error.message);
            process.exit(1);
        }
    }

    async disconnect() {
        try {
            await mongoose.connection.close();
            this.isConnected = false;
            console.log('🔌 MongoDB Disconnected');
        } catch (error) {
            console.error('❌ MongoDB disconnect error:', error.message);
        }
    }

    // Connection event handlers
    setupEventHandlers() {
        mongoose.connection.on('connected', () => {
            console.log('🟢 Mongoose connected to MongoDB');
        });

        mongoose.connection.on('error', (err) => {
            console.error('🔴 Mongoose connection error:', err);
        });

        mongoose.connection.on('disconnected', () => {
            console.log('🟡 Mongoose disconnected');
            this.isConnected = false;
        });

        mongoose.connection.on('reconnected', () => {
            console.log('🔄 Mongoose reconnected');
            this.isConnected = true;
        });

        // Handle app termination
        process.on('SIGINT', async () => {
            console.log('\n🛑 Received SIGINT. Closing MongoDB connection...');
            await this.disconnect();
            process.exit(0);
        });

        process.on('SIGTERM', async () => {
            console.log('\n🛑 Received SIGTERM. Closing MongoDB connection...');
            await this.disconnect();
            process.exit(0);
        });
    }

    getConnectionStatus() {
        return {
            isConnected: this.isConnected,
            readyState: mongoose.connection.readyState,
            host: mongoose.connection.host,
            port: mongoose.connection.port,
            name: mongoose.connection.name
        };
    }
}

// Export singleton instance
const database = new DatabaseConnection();
module.exports = database;
