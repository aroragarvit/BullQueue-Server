import { Worker } from 'bullmq';
import { connection } from './queue';
import { updateFileStatus } from '../database';
import { FileProcessingJob, FileProcessingResult, FileProcessingStatus } from '../types';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import os from 'os';
import http from 'http';
import https from 'https';
import { createConversation, linkFileToConversation } from '../database';

const writeFileAsync = promisify(fs.writeFile);
const unlinkAsync = promisify(fs.unlink);

// Function to download a file from a URL
async function downloadFile(url: string): Promise<string> {
  try {
    const tempFilePath = path.join(os.tmpdir(), `temp-file-${Date.now()}.jsonl`);
    
    return new Promise<string>((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;
      
      const request = protocol.get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download file: HTTP status ${response.statusCode}`));
          return;
        }

        const fileStream = fs.createWriteStream(tempFilePath);
        response.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close();
          resolve(tempFilePath);
        });

        fileStream.on('error', (err) => {
          fs.unlink(tempFilePath, () => {});
          reject(err);
        });
      });

      request.on('error', (err) => {
        reject(err);
      });
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error downloading file:', errorMessage);
    throw new Error(`Failed to download file: ${errorMessage}`);
  }
}

// Function to parse JSONL file and create conversations
async function parseJsonlFile(filePath: string, fileId: string): Promise<{ totalConversations: number, conversationIds: string[] }> {
  try {
    const fileContent = await fs.promises.readFile(filePath, 'utf-8');
    const lines = fileContent.split('\n').filter(line => line.trim() !== '');
    
    const conversationIds: string[] = [];
    
    for (const line of lines) {
      try {
        const jsonData = JSON.parse(line);
        
        // Create a conversation record
        const conversation = await createConversation(jsonData);
        
        // Link the conversation to the file
        await linkFileToConversation(fileId, conversation.id);
        
        conversationIds.push(conversation.id);
      } catch (parseError) {
        const errorMessage = parseError instanceof Error ? parseError.message : 'Unknown error';
        console.error('Error parsing line:', errorMessage);
        // Continue with next line instead of failing the whole job
      }
    }
    
    return {
      totalConversations: conversationIds.length,
      conversationIds
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error processing file:', errorMessage);
    throw error;
  } finally {
    // Clean up the temporary file
    try {
      await unlinkAsync(filePath);
    } catch (cleanupError) {
      const errorMessage = cleanupError instanceof Error ? cleanupError.message : 'Unknown error';
      console.error('Error cleaning up temporary file:', errorMessage);
    }
  }
}

// Setup worker function
export function setupWorker() {
  const worker = new Worker<FileProcessingJob, FileProcessingResult>('file-processing', async (job) => {
    console.log(`Processing job ${job.id} - File: ${job.data.fileName}`);
    
    try {
      // Update status to processing
      await updateFileStatus(job.data.fileId, FileProcessingStatus.PROCESSING);
      
      // Step 1: Download file from URL
      console.log(`Downloading file from URL: ${job.data.fileUrl}`);
      const filePath = await downloadFile(job.data.fileUrl);
      
      // Step 2: Process the file content
      console.log('Parsing JSONL file...');
      const result = await parseJsonlFile(filePath, job.data.fileId);
      
      // Step 3: Update file status to completed
      await updateFileStatus(job.data.fileId, FileProcessingStatus.COMPLETED, {
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
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await updateFileStatus(job.data.fileId, FileProcessingStatus.FAILED, { 
        error: errorMessage
      });
      
      // Re-throw to trigger BullMQ retry mechanism
      throw error;
    }
  }, { connection, concurrency: 1 }); // Process only 1 job at a time
  
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