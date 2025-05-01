const { Worker } = require('bullmq');
const { connection } = require('./queue');
const { downloadFileFromSupabase, parseJsonlFile } = require('../processing/fileProcessor');
const { updateFileStatus } = require('../database/db');

// Setup worker function
function setupWorker() {
  const worker = new Worker('file-processing', async (job) => {
    console.log(`Processing job ${job.id} - File: ${job.data.fileName}`);
    
    try {
      // Update status to processing
      await updateFileStatus(job.data.fileId, 'processing');
      
      // Step 1: Download file from Supabase
      console.log(`Downloading file from Supabase: ${job.data.storagePath}`);
      const fileContent = await downloadFileFromSupabase(job.data.storagePath);
      
      if (!fileContent) {
        throw new Error('Failed to download file from storage');
      }
      
      // Step 2: Process the file content
      console.log('Parsing JSONL file...');
      const result = await parseJsonlFile(fileContent, job.data.fileId);
      
      // Step 3: Update file status to completed
      await updateFileStatus(job.data.fileId, 'completed', {
        conversationsProcessed: result.totalConversations,
        conversationIds: result.conversationIds
      });
      
      console.log(`Job ${job.id} completed successfully. Processed ${result.totalConversations} conversations.`);
      return {
        success: true,
        fileId: job.data.fileId,
        conversationsProcessed: result.totalConversations,
        conversationIds: result.conversationIds
      };
      
    } catch (error) {
      // Update status to failed
      console.error(`Error processing job ${job.id}:`, error);
      await updateFileStatus(job.data.fileId, 'failed', { 
        error: error.message || 'Unknown error'
      });
      
      // Re-throw to trigger BullMQ retry mechanism
      throw error;
    }
  }, { connection });
  
  // Event handlers
  worker.on('completed', (job) => {
    console.log(`Job ${job.id} has completed successfully`);
  });
  
  worker.on('failed', (job, error) => {
    console.error(`Job ${job?.id} has failed with error:`, error);
  });
  
  worker.on('error', (error) => {
    console.error('Worker error:', error);
  });
  
  console.log('File processing worker started');
  return worker;
}

module.exports = {
  setupWorker
}; 