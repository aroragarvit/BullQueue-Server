import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { files, conversations, fileConversations } from './schema';
import { eq } from 'drizzle-orm';
import { FileProcessingStatus } from '../types';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const connectionString = process.env.DATABASE_URL || '';
const client = postgres(connectionString, {
  idle_timeout: 0,
});

export const db = drizzle(client);

export const getFileById = async (fileId: string) => {
  const [fileRecord] = await db.select().from(files).where(eq(files.id, fileId));
  return fileRecord;
};

export const updateFileStatus = async (fileId: string, status: FileProcessingStatus, metadata?: Record<string, any>) => {
  let updateData: any = { synced: status === FileProcessingStatus.COMPLETED };
  
  if (metadata) {
    updateData.notes = JSON.stringify(metadata);
  }
  
  const [updated] = await db.update(files)
    .set(updateData)
    .where(eq(files.id, fileId))
    .returning();
    
  return updated;
};
