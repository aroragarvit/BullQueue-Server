# JSONL File Processing Server

This is a TypeScript Express server for processing JSONL files with a BullMQ queue system.

## Features

- REST API for file processing
- Asynchronous job queue with Redis
- Background worker process for CPU-intensive tasks
- PostgreSQL database with Drizzle ORM
- TypeScript for type safety
- Batch processing (50 records per batch) for efficient database insertion
- Real-time progress tracking

## Project Structure

```
server/
├── src/                 # TypeScript source code
│   ├── database/        # Database models and connection
│   ├── queue/           # BullMQ queue configuration
│   ├── types/           # TypeScript type definitions
│   ├── index.ts         # Main Express application
│   └── worker-process.ts # Standalone worker process
├── dist/                # Compiled JavaScript output
├── tsconfig.json        # TypeScript configuration
├── package.json        
└── .env.local           # Environment variables (create from .env.example)
```

## Setup

### Prerequisites

- Node.js >= 16
- Redis server
- PostgreSQL database

### Installation

1. Install dependencies:

```bash
npm install
```

2. Create a .env.local file with the required environment variables:

```
DATABASE_URL=postgres://username:password@localhost:5432/database
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=optional_password
PORT=3001
```

3. Build the TypeScript code:

```bash
npm run build
```

### Development

Run the development server with hot reloading:

```bash
npm run dev
```

Run the development worker with hot reloading:

```bash
npm run dev:worker
```

Or run both simultaneously:

```bash
npm run dev:all
```

### Production

For production deployment, you can use the provided PM2 configuration:

```bash
npm run build
pm2 start ecosystem.config.js
```

Or run with Node directly:

```bash
npm run start:all
```

## API Endpoints

### Create a File Record

```
POST /api/files
```

Request body:
```json
{
  "fileName": "example.jsonl",
  "fileUrl": "https://example.com/path/to/file.jsonl",
  "notes": "Optional notes about the file"
}
```

### Process a File

```
POST /api/webhook/file-uploaded
```

Request body:
```json
{
  "fileId": "uuid-of-file"
}
```

### Get File Status

```
GET /api/files/:fileId
```

Response:
```json
{
  "id": "uuid-of-file",
  "fileName": "example.jsonl",
  "fileUrl": "https://example.com/path/to/file.jsonl",
  "notes": "Optional notes or processing metadata",
  "synced": true,
  "createdAt": "2023-05-31T12:00:00Z",
  "updatedAt": "2023-05-31T12:15:00Z",
  "status": "completed"
}
```

### Get Job Progress

```
GET /api/jobs/:jobId/progress
```

Response:
```json
{
  "jobId": "job-id",
  "progress": 75,
  "state": "active",
  "fileId": "uuid-of-file",
  "fileName": "example.jsonl"
}
```

## File Processing Flow

1. Client uploads a file to storage and gets a URL
2. Client creates a file record in the database via POST /api/files
3. Client triggers processing via POST /api/webhook/file-uploaded
4. Server adds the job to the BullMQ queue
5. Worker process picks up the job and:
   - Downloads the file from the URL
   - Parses the JSONL file line by line
   - Processes conversations in batches of 50 for better performance
   - Creates conversation records in the database
   - Links conversations to the file
   - Updates the file status to completed
   - Reports progress throughout the operation
6. Client can check processing status via GET /api/files/:fileId or GET /api/jobs/:jobId/progress

## Batch Processing

The server uses batch processing to efficiently handle large JSONL files:

- Each batch contains up to 50 conversation records
- Batches are processed sequentially to avoid overwhelming the database
- Progress is reported as a percentage of total lines processed
- Database insertions use bulk operations for better performance

## Database Schema

The application uses the following database schema:

- **files**: Stores file metadata and processing status
- **conversations**: Stores conversation data from the JSONL files
- **file_conversations**: Links files to their conversations (many-to-many) 