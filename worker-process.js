/**
 * Standalone worker process for processing JSONL files
 * Run this as a separate process from the Express server for better performance and isolation
 */

const { setupWorker } = require('./queue/worker');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

console.log('Starting BullMQ worker process...');
console.log(`Redis connection: ${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`);

// Initialize the worker
const worker = setupWorker();

// Handle process shutdown gracefully
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing worker...');
  await worker.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing worker...');
  await worker.close();
  process.exit(0);
});

console.log('Worker process started successfully'); 