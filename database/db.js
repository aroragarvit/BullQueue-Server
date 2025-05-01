// Replace PostgreSQL pool with Drizzle ORM
const { drizzle } = require('drizzle-orm/postgres-js');
const postgres = require('postgres');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

// Initialize Drizzle with postgres-js client
const client = postgres(process.env.DATABASE_URL, {
  max: 3, // Slightly higher connection pool for server
  idle_timeout: 0,
});

const db = drizzle(client);

// Schema definitions (mirroring src/db/schema.ts)
const schema = {
  files: {
    id: 'id',
    fileName: 'file_name',
    status: 'status',
    metadata: 'metadata',
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  },
  conversations: {
    id: 'id',
    messages: 'messages',
    deleted: 'deleted',
    edited: 'edited',
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  },
  fileConversations: {
    id: 'id',
    fileId: 'file_id',
    conversationId: 'conversation_id',
    sequenceIndex: 'sequence_index',
    createdAt: 'created_at'
  }
};

/**
 * Create a new file record in the database
 * @param {string} fileName - The name of the file
 * @returns {Promise<Object>} - The created file record
 */
async function createFileRecord(fileName) {
  try {
    const result = await db.execute(
      postgres.sql`INSERT INTO files (file_name, status, created_at, updated_at) 
                  VALUES (${fileName}, 'pending', NOW(), NOW()) 
                  RETURNING id, file_name, status, created_at, updated_at`
    );
    
    const fileRecord = result[0];
    return {
      id: fileRecord.id,
      fileName: fileRecord.file_name,
      status: fileRecord.status,
      createdAt: fileRecord.created_at,
      updatedAt: fileRecord.updated_at
    };
  } catch (error) {
    console.error('Error creating file record:', error);
    throw error;
  }
}

/**
 * Update the status of a file
 * @param {string} fileId - The ID of the file
 * @param {string} status - The new status
 * @param {Object} metadata - Additional metadata to store
 * @returns {Promise<void>}
 */
async function updateFileStatus(fileId, status, metadata = {}) {
  try {
    await db.execute(
      postgres.sql`UPDATE files 
                  SET status = ${status}, metadata = ${JSON.stringify(metadata)}, updated_at = NOW() 
                  WHERE id = ${fileId}`
    );
  } catch (error) {
    console.error('Error updating file status:', error);
    throw error;
  }
}

/**
 * Insert a batch of conversations into the database
 * @param {Array<Object>} conversations - The conversations to insert
 * @returns {Promise<Array<string>>} - The IDs of inserted conversations
 */
async function batchInsertConversations(conversations) {
  if (!conversations || conversations.length === 0) {
    return [];
  }
  
  try {
    const conversationValues = conversations.map(conv => {
      return {
        messages: JSON.stringify(conv),
        deleted: false,
        edited: false
      };
    });
    
    // Insert conversations
    const insertedConversations = await db.transaction(async (tx) => {
      // Insert conversations
      const result = await tx.execute(
        postgres.sql`INSERT INTO conversations (messages, deleted, edited, created_at, updated_at)
                    SELECT messages, deleted, edited, NOW(), NOW()
                    FROM ${postgres.json(conversationValues)}
                    RETURNING id`
      );
      
      // Create file-conversation mappings
      if (result.length > 0) {
        const fileId = conversations[0].fileId; // Assuming all are from the same file
        
        const mappingValues = result.map((conv, index) => {
          return {
            file_id: fileId,
            conversation_id: conv.id,
            sequence_index: index
          };
        });
        
        await tx.execute(
          postgres.sql`INSERT INTO file_conversations (file_id, conversation_id, sequence_index, created_at)
                      SELECT file_id, conversation_id, sequence_index, NOW()
                      FROM ${postgres.json(mappingValues)}`
        );
      }
      
      return result;
    });
    
    return insertedConversations.map(conv => conv.id);
  } catch (error) {
    console.error('Error in batch insert:', error);
    throw error;
  }
}

/**
 * Get file status by ID
 * @param {string} fileId - The ID of the file
 * @returns {Promise<Object>} - The file status
 */
async function getFileStatus(fileId) {
  try {
    const result = await db.execute(
      postgres.sql`SELECT id, file_name, status, metadata, created_at, updated_at 
                  FROM files WHERE id = ${fileId}`
    );
    
    if (result.length === 0) {
      return null;
    }
    
    const fileRecord = result[0];
    return {
      id: fileRecord.id,
      fileName: fileRecord.file_name,
      status: fileRecord.status,
      metadata: fileRecord.metadata || {},
      createdAt: fileRecord.created_at,
      updatedAt: fileRecord.updated_at
    };
  } catch (error) {
    console.error('Error getting file status:', error);
    throw error;
  }
}

// Health check function to verify database connection
async function healthCheck() {
  try {
    await db.execute(postgres.sql`SELECT NOW()`);
    return true;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
}

module.exports = {
  createFileRecord,
  updateFileStatus,
  batchInsertConversations,
  getFileStatus,
  healthCheck,
  db
}; 