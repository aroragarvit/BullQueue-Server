const { Queue } = require('bullmq');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

// Redis connection configuration
const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD
};

// Create a new queue named 'file-processing'
const queue = new Queue('file-processing', {
  connection,
  defaultJobOptions: {
    attempts: 3,             // Number of retry attempts if job fails
    backoff: {
      type: 'exponential',   // Exponential backoff strategy
      delay: 5000            // Initial delay in ms (5 seconds)
    },
    removeOnComplete: true,  // Remove jobs from queue when complete
    removeOnFail: false,     // Keep failed jobs for inspection
    timeout: 1800000,        // Timeout after 30 minutes
  }
});

module.exports = {
  queue,
  connection
}; 