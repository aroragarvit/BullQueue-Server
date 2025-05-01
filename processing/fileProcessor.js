const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const { batchInsertConversations } = require('../database/db');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY; // Use service key for admin privileges
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Upload a file to Supabase Storage
 * @param {string} fileId - The database ID of the file
 * @param {string} fileName - The name of the file
 * @param {Buffer} fileBuffer - The file content as a buffer
 * @returns {Promise<Object>} - Upload result with path
 */
async function uploadToSupabase(fileId, fileName, fileBuffer) {
  const { data, error } = await supabase.storage
    .from('jsonl-files')
    .upload(`files/${fileId}/${fileName}`, fileBuffer, {
      contentType: 'application/x-jsonl',
      cacheControl: '3600',
    });

  if (error) {
    console.error('Supabase storage upload error:', error);
    throw error;
  }

  return { path: data.path };
}

/**
 * Download a file from Supabase Storage
 * @param {string} storagePath - The storage path of the file
 * @returns {Promise<string>} - The file content as a string
 */
async function downloadFileFromSupabase(storagePath) {
  try {
    const { data, error } = await supabase.storage
      .from('jsonl-files')
      .download(storagePath);

    if (error) {
      console.error('Supabase storage download error:', error);
      throw error;
    }

    // Convert the blob to text
    const fileContent = await data.text();
    return fileContent;
  } catch (error) {
    console.error('Error downloading file from Supabase:', error);
    throw error;
  }
}

/**
 * Parse a JSONL file and insert conversations into the database
 * @param {string} fileContent - The content of the JSONL file
 * @param {string} fileId - The database ID of the file
 * @returns {Promise<Object>} - Processing result
 */
async function parseJsonlFile(fileContent, fileId) {
  console.log('Starting JSONL file processing...');
  
  try {
    const lines = fileContent.trim().split('\n');
    const conversationIds = [];
    let totalConversations = 0;
    let successfulBatches = 0;
    let failedBatches = 0;

    console.log(`Total lines in file: ${lines.length}`);

    // Process in smaller batches for better connection stability
    const BATCH_SIZE = 50;
    const MAX_RETRIES = 3;

    for (let i = 0; i < lines.length; i += BATCH_SIZE) {
      const batchLines = lines.slice(i, i + BATCH_SIZE);
      const conversationBatch = [];
      const batchStart = i;
      const batchEnd = Math.min(i + BATCH_SIZE - 1, lines.length - 1);

      console.log(`Processing batch ${successfulBatches + failedBatches + 1}: lines ${batchStart} to ${batchEnd}`);

      // Parse all valid entries in this batch
      let validEntriesInBatch = 0;
      for (let j = 0; j < batchLines.length; j++) {
        try {
          const line = batchLines[j].trim();
          if (!line) continue;
          
          const parsed = JSON.parse(line);

          if (parsed.messages && Array.isArray(parsed.messages)) {
            // Prepare conversation for database
            conversationBatch.push({
              messages: parsed.messages,
              fileId, // Add fileId for linking conversations to files
            });
            validEntriesInBatch++;
          }
        } catch (lineError) {
          console.error(`Error parsing line ${i + j}:`, lineError);
          // Continue processing other lines even if one fails
        }
      }

      console.log(`Found ${validEntriesInBatch} valid conversations in batch`);

      // If we have valid conversations, insert them with retries
      if (conversationBatch.length > 0) {
        let retries = 0;
        let success = false;

        while (!success && retries < MAX_RETRIES) {
          try {
            console.log(`Inserting batch (attempt ${retries + 1}/${MAX_RETRIES})...`);

            // Insert batch using the db function
            const batchIds = await batchInsertConversations(conversationBatch);
            conversationIds.push(...batchIds);
            
            console.log(`Successfully inserted ${batchIds.length} conversations`);
            totalConversations += batchIds.length;
            success = true;
            successfulBatches++;
            
            console.log(`Batch complete: ${totalConversations}/${lines.length} conversations processed so far`);
          } catch (error) {
            retries++;
            console.error(`Batch insertion error (attempt ${retries}/${MAX_RETRIES}):`, error);

            if (retries >= MAX_RETRIES) {
              console.error('Max retries reached for batch. Moving to next batch.');
              failedBatches++;
            } else {
              // Exponential backoff between retries
              const waitTime = 1000 * Math.pow(2, retries);
              console.log(`Waiting ${waitTime}ms before retry...`);
              await new Promise((resolve) => setTimeout(resolve, waitTime));
            }
          }
        }
      }

      // Increased delay between batches to avoid connection overload
      if (i + BATCH_SIZE < lines.length) {
        const cooldownTime = 1000; // 1 second cooldown between batches
        console.log(`Cooldown between batches: ${cooldownTime}ms`);
        await new Promise((resolve) => setTimeout(resolve, cooldownTime));
      }
    }

    console.log(`Processing complete:`);
    console.log(`- Total batches: ${successfulBatches + failedBatches}`);
    console.log(`- Successful batches: ${successfulBatches}`);
    console.log(`- Failed batches: ${failedBatches}`);
    console.log(`- Total conversations inserted: ${totalConversations}`);

    return { 
      totalConversations, 
      conversationIds,
      success: true 
    };
  } catch (error) {
    console.error('Error processing JSONL file:', error);
    throw error;
  }
}

module.exports = {
  uploadToSupabase,
  downloadFileFromSupabase,
  parseJsonlFile
}; 