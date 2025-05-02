import express, { Request, Response } from 'express';
import cors from 'cors';
import { getFileById } from './database';
import { addFileProcessingJob, queue } from './queue/queue';
import { setupWorker } from './queue/worker';
import dotenv from 'dotenv';


// Load environment variables from .env file
dotenv.config();

// Initialize express app
const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Route to handle file upload webhook
app.post('/api/webhook/file-uploaded', async (req: Request, res: Response) => {
  try {
    const { fileId } = req.body;
    
    if (!fileId) {
      return res.status(400).json({ error: 'Missing fileId in request body' });
    }
    
    // Get file details from database
    const fileRecord = await getFileById(fileId);
    
    if (!fileRecord) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Add file to processing queue
    const job = await addFileProcessingJob(
      fileRecord.id,
      fileRecord.fileName,
      fileRecord.fileUrl
    );
    
    res.status(200).json({
      success: true,
      message: 'File added to processing queue',
      jobId: job.id,
      fileId: fileRecord.id
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error handling file upload webhook:', errorMessage);
    res.status(500).json({ error: errorMessage });
  }
});

// Setup the worker to process queue items
// Note: This worker runs in the same Node.js process as the Express server
// For better performance, consider running the worker in a separate process using src/worker-process.ts
setupWorker();

// Start the server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Express server running on port ${PORT}`);
    console.log(`Note: BullMQ worker is running in the same process as the Express server`);
  });
}

// Export for testing or programmatic usage
export default app; 