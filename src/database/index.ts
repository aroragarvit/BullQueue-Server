import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import path from 'path';
import { files, conversations, fileConversations } from './schema';
import { eq } from 'drizzle-orm';
import { FileProcessingStatus } from '../types';

// Load environment variables
config({ path: path.resolve(__dirname, '../../.env.local') });

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
