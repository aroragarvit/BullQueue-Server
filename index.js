const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const { queue } = require('./queue/queue');
const { setupWorker } = require('./queue/worker');
const { downloadFileFromSupabase, uploadToSupabase } = require('./processing/fileProcessor');
const { createFileRecord, getFileStatus } = require('./database/db');

// Initialize express app
const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Configure multer for handling file uploads (in memory storage)
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Setup the worker to process queue items
// Note: This worker runs in the same Node.js process as the Express server
// For better performance, consider running the worker in a separate process using server/worker-process.js
setupWorker();

// API Routes
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    // Validate file type
    if (!req.file.originalname.endsWith('.jsonl')) {
      return res.status(400).json({ error: 'Only JSONL files are accepted' });
    }

    // Create a file record in database
    const fileRecord = await createFileRecord(req.file.originalname);
    
    if (!fileRecord || !fileRecord.id) {
      return res.status(500).json({ error: 'Failed to create file record' });
    }

    const fileId = fileRecord.id;
    
    // Upload file to Supabase Storage
    const fileBuffer = req.file.buffer;
    const uploadResult = await uploadFileToSupabase(fileId, req.file.originalname, fileBuffer);

    if (!uploadResult.success) {
      return res.status(500).json({ error: 'Failed to upload file to storage: ' + uploadResult.error });
    }

    // Enqueue the file processing task
    await queue.add('processFile', {
      fileId,
      fileName: req.file.originalname,
      storagePath: uploadResult.path
    });

    // Return success response immediately without waiting for processing
    return res.status(200).json({
      success: true,
      fileId,
      fileName: req.file.originalname,
      message: 'File uploaded successfully and queued for processing'
    });
    
  } catch (error) {
    console.error('Upload error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ error: 'Internal server error: ' + errorMessage });
  }
});

/**
 * Primary webhook endpoint for files already uploaded to Supabase
 * This is the main flow when files are uploaded directly to Supabase from the client
 */
app.post('/api/webhook/file-uploaded', express.json(), async (req, res) => {
  try {
    console.log('Webhook received:', req.body);
    
    // Extract information from the webhook payload
    // Adjust these based on your actual Supabase webhook payload structure
    const { 
      record: { 
        name: fileName,
        id: supabaseObjectId, 
        path: storagePath 
      } = {},
      bucket_id: bucketId
    } = req.body;
    
    if (!fileName || !storagePath) {
      return res.status(400).json({ 
        error: 'Missing required file information in webhook payload',
        received: req.body
      });
    }
    
    // Create a file record in our database
    const fileRecord = await createFileRecord(fileName);
    
    if (!fileRecord || !fileRecord.id) {
      return res.status(500).json({ error: 'Failed to create file record' });
    }
    
    // Enqueue the file processing task using the storage path
    await queue.add('processFile', {
      fileId: fileRecord.id,
      fileName,
      storagePath,
      supabaseObjectId,
      bucketId
    }, {
      attempts: 5, // Increase attempts for webhook-triggered processing
      backoff: {
        type: 'exponential',
        delay: 10000 // Start with 10 seconds delay
      }
    });
    
    // Return success response to Supabase immediately
    return res.status(200).json({ 
      success: true, 
      message: 'File processing queued',
      fileId: fileRecord.id 
    });
  } catch (error) {
    console.error('Webhook processing error:', error);
    // Always return 200 to Supabase to prevent webhook retries
    // Log the error internally but don't expose details
    return res.status(200).json({ 
      success: false,
      message: 'Webhook received but processing failed' 
    });
  }
});

// Enhanced API endpoint to check processing status with detailed metadata
app.get('/api/status/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    
    // Get file status from database
    const fileStatus = await getFileStatus(fileId);
    
    if (!fileStatus) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    return res.status(200).json(fileStatus);
  } catch (error) {
    console.error('Status check error:', error);
    return res.status(500).json({ error: 'Failed to retrieve status' });
  }
});

// Upload file to Supabase function
async function uploadFileToSupabase(fileId, fileName, fileBuffer) {
  try {
    const result = await uploadToSupabase(fileId, fileName, fileBuffer);
    return { success: true, path: result.path };
  } catch (error) {
    console.error('Supabase upload error:', error);
    return { success: false, error: error.message || 'Unknown error' };
  }
}

// Start the server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Express server running on port ${PORT}`);
    console.log(`Note: BullMQ worker is running in the same process as the Express server`);
  });
}

// Export for testing or programmatic usage
module.exports = app; 