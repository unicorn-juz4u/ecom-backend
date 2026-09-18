const mongoose = require('mongoose');

let isConnected = false;

const connectDB = async () => {
  if (isConnected) {
    return;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn('[DB WARNING] MONGODB_URI is not defined. Order persistence will operate in fallback mode.');
    return;
  }

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
    });
    isConnected = true;
    console.log(`[MongoDB] Connected successfully to host: ${conn.connection.host}, database: ${conn.connection.name}`);
  } catch (error) {
    console.error('[MongoDB Connection Error]:', error.message);
    // Do not crash server in development if network issue occurs, allow retry on requests
  }
};

module.exports = connectDB;
