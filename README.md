# JSONL Editor Server

A dedicated Express backend for handling the asynchronous processing of JSONL files offloaded from the Next.js frontend.

## Architecture

This implementation uses:

- **Express**: Web server framework
- **BullMQ**: Redis-backed job queue for reliable asynchronous processing
- **Supabase**: For file storage
- **PostgreSQL**: For data storage
- **Redis**: For queue management

### Processing Architecture

This backend supports two deployment models:

1. **Single Process** (Default): Express server and BullMQ worker run in the same Node.js process
   - Simpler deployment
   - Suitable for low to moderate workloads
   - Limited scalability (worker tasks share resources with the API server)

2. **Multiple Processes**: Express server and BullMQ worker run as separate processes
   - Better isolation between API responses and background processing
   - Improved performance for CPU-intensive file processing
   - Ability to scale workers independently
   - Requires running multiple processes

### File Processing Flow

The system supports two primary flows:

1. **Direct Upload**: Files are uploaded directly to the Express server
   - Client uploads to `/api/upload` endpoint
   - Server uploads to Supabase and enqueues processing

2. **Webhook-based** (Recommended): Files are uploaded directly to Supabase
   - Client uploads file directly to Supabase storage (bypassing server)
   - Supabase triggers a webhook to `/api/webhook/file-uploaded`
   - Server receives the webhook and enqueues the file for processing
   - This approach is more efficient as it avoids double-handling large files

## Setup Instructions

### Prerequisites

1. Node.js (v16+)
2. Redis server
3. PostgreSQL database
4. Supabase account with storage bucket configured

### Installation

1. Navigate to the server directory
2. Install dependencies:

```bash
cd server
npm install
```

3. Copy the environment variables file and update with your configuration:

```bash
cp .env.example .env
```

4. Update the `.env` file with your database credentials, Supabase credentials, and Redis configuration.

### Database Setup

Ensure your PostgreSQL database has the required tables:

```sql
CREATE TABLE files (
  id SERIAL PRIMARY KEY,
  file_name VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
);

CREATE TABLE conversations (
  id VARCHAR(255) PRIMARY KEY,
  file_id INTEGER REFERENCES files(id),
  conversation_data JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL
);
```

### Supabase Setup

1. Create a Supabase project
2. Create a storage bucket named `jsonl-files`
3. Set appropriate permissions (public, authenticated, or service role)
4. Get your project URL and service role key for the `.env` file
5. For webhook setup:
   - Configure storage event triggers in Supabase dashboard
   - Set webhook URL to point to your server's `/api/webhook/file-uploaded` endpoint

## Running the Application

### Development (Single Process)

```bash
npm run dev
```

### Development (Multi Process)

```bash
# In terminal 1
npm run dev

# In terminal 2
npm run dev:worker

# Or using concurrently to start both
npm run dev:all
```

### Production (Single Process)

```bash
npm start
```

### Production (Multi Process)

```bash
# Using concurrently to start both
npm run start:all

# Or using process management tools like PM2
pm2 start ecosystem.config.js
```

## API Endpoints

- `POST /api/upload` - Upload a JSONL file for processing
- `POST /api/webhook/file-uploaded` - Webhook endpoint for Supabase storage events
- `GET /api/status/:fileId` - Check processing status of a file

## Integration with Next.js Frontend

### Recommended: Supabase Direct Upload Flow

```javascript
// Direct upload to Supabase from frontend
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://your-project.supabase.co',
  'your-public-anon-key'
);

const uploadFileToSupabase = async (file) => {
  const fileExt = file.name.split('.').pop();
  const fileName = `${Math.random()}.${fileExt}`;
  const filePath = `uploads/${fileName}`;
  
  // Upload directly to Supabase
  const { data, error } = await supabase.storage
    .from('jsonl-files')
    .upload(filePath, file);
    
  if (error) throw error;
  
  // Webhook will handle processing automatically
  // You can poll the status endpoint to check progress
  return { filePath, fileName };
};
```

### Checking Status

```javascript
const checkStatus = async (fileId) => {
  const response = await fetch(`http://your-express-backend/api/status/${fileId}`);
  return response.json();
};
```

## Performance Considerations

### Handling Multiple Uploads

The system can handle multiple uploads simultaneously:

1. **Concurrent Requests**: Express handles multiple upload requests concurrently
2. **Queue Management**: BullMQ queues jobs in Redis, ensuring none are lost
3. **Worker Processing**: The worker processes one job at a time (configurable for concurrency)

For high-volume systems, consider:
- Running workers as separate processes (use `npm run dev:all` or `npm run start:all`)
- Running multiple worker instances to scale horizontally
- Increasing worker concurrency in `queue/worker.js` 