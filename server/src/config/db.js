const mongoose = require('mongoose');

const connectDB = async () => {
  if (!process.env.MONGO_URI) {
    throw new Error('Missing MONGO_URI env variable');
  }

  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected');
  } catch (error) {
    console.error('Mongo connection error:', error.message);
    throw error;
  }
};

module.exports = connectDB;

