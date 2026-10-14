const mongoose = require('mongoose');
const config = require('./config');

mongoose.set('strictQuery', true);

async function connectDB() {
  await mongoose.connect(config.mongoUri, {
    maxPoolSize: Number(process.env.MONGO_POOL_SIZE) || 50,
    serverSelectionTimeoutMS: 10000,
  });
  console.log(`[db] connected (${mongoose.connection.name})`);
}

module.exports = { connectDB, mongoose };
