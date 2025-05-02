import { Queue } from 'bullmq';
import { FileProcessingJob } from '../types';

// Redis connection configuration
const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD
};

// Create a new queue named 'file-processing'
const queue = new Queue<FileProcessingJob>('file-processing', {
  connection,
  defaultJobOptions: {
    attempts: 3,             // Number of retry attempts if job fails
    backoff: {
      type: 'exponential',   // Exponential backoff strategy
      delay: 5000            // Initial delay in ms (5 seconds)
    },
    removeOnComplete: false,  // Remove jobs from queue when complete
    removeOnFail: false      // Keep failed jobs for inspection
  }
});

// Add a file processing job to the queue
export const addFileProcessingJob = async (fileId: string, fileName: string, fileUrl: string) => {
  const job = await queue.add('process-file', {
    fileId,
    fileName,
    fileUrl
  });
  
  return job;
};

export { queue, connection }; 