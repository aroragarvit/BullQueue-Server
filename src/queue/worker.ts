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
import { db } from '../database';
import { conversations, fileConversations } from '../database/schema';

const unlinkAsync = promisify(fs.unlink);
const BATCH_SIZE = 50; // Process conversations in batches of 50

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

// Function to count total lines in a file
async function countFileLines(filePath: string): Promise<number> {
  const fileContent = await fs.promises.readFile(filePath, 'utf-8');
  return fileContent.split('\n').filter(line => line.trim() !== '').length;
}

// Function to insert a batch of conversations and their file links
async function insertConversationBatch(conversationBatch: any[], fileId: string): Promise<string[]> {
  if (conversationBatch.length === 0) return [];
  
  // Insert conversations in a batch
  const conversationsToInsert = conversationBatch.map(jsonData => ({
    // type convert this json data to be of type jsonb
    messages: jsonData as JSON,
    deleted: false,
    edited: false
  }));
  
  const insertedConversations = await db.insert(conversations)
    .values(conversationsToInsert)
    .returning();
  
  const conversationIds = insertedConversations.map(c => c.id);
  
  // Link conversations to file in a batch
  const fileConversationsToInsert = conversationIds.map(conversationId => ({
    fileId,
    conversationId
  }));
  
  await db.insert(fileConversations)
    .values(fileConversationsToInsert);
  
  return conversationIds;
}

// Function to parse JSONL file and create conversations in batches
async function parseJsonlFile(filePath: string, fileId: string, job: any): Promise<{ totalConversations: number, conversationIds: string[] }> {
  try {
    // Count total lines for progress tracking
    const totalLines = await countFileLines(filePath);
    let processedLines = 0;
    
    const fileContent = await fs.promises.readFile(filePath, 'utf-8');
    const lines = fileContent.split('\n').filter(line => line.trim() !== '');
    
    const allConversationIds: string[] = [];
    let currentBatch: any[] = [];
    
    for (const line of lines) {
      try {
        const jsonData = JSON.parse(line);
        console.log("jsonData", jsonData);
        return {
          totalConversations: 0,
          conversationIds: []
        }
        currentBatch.push(jsonData);
        
        // When batch size is reached or on the last item, process the batch
        if (currentBatch.length >= BATCH_SIZE || processedLines === lines.length - 1) {
          const batchConversationIds = await insertConversationBatch(currentBatch, fileId);
          allConversationIds.push(...batchConversationIds);
          
          // Update progress
          processedLines += currentBatch.length;
          const progress = Math.floor((processedLines / totalLines) * 100);
          await job.updateProgress(progress);
          
          console.log(`Processed ${processedLines}/${totalLines} conversations (${progress}%)`);
          
          // Reset the batch
          currentBatch = [];
        }
      } catch (parseError) {
        const errorMessage = parseError instanceof Error ? parseError.message : 'Unknown error';
        console.error('Error parsing line:', errorMessage);
        // Continue with next line instead of failing the whole job
        processedLines++;
      }
    }
    
    // Process any remaining items in the batch
    if (currentBatch.length > 0) {
      const batchConversationIds = await insertConversationBatch(currentBatch, fileId);
      allConversationIds.push(...batchConversationIds);
      processedLines += currentBatch.length;
      
      // Final progress update
      await job.updateProgress(100);
    }
    
    return {
      totalConversations: allConversationIds.length,
      conversationIds: allConversationIds
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
      
      // Initialize progress
      await job.updateProgress(0);
      
      // Step 1: Download file from URL
      console.log(`Downloading file from URL: ${job.data.fileUrl}`);
      const filePath = await downloadFile(job.data.fileUrl);
      
      // Step 2: Process the file content
      console.log('Parsing JSONL file...');
      const result = await parseJsonlFile(filePath, job.data.fileId, job);
      
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
  
  worker.on('progress', (job, progress) => {
    console.log(`Job ${job.id} is ${progress}% complete`);
  });
  
  console.log('File processing worker started');
  return worker;
} 