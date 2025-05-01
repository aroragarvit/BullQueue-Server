export interface FileRecord {
  id: string;
  fileName: string;
  fileUrl: string;
  notes?: string;
  synced: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Conversation {
  id: string;
  messages: any;
  deleted: boolean;
  edited: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface FileConversation {
  id: string;
  fileId: string;
  conversationId: string;
  createdAt?: string;
}

export enum FileProcessingStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

export interface FileProcessingJob {
  fileId: string;
  fileName: string;
  fileUrl: string;
}

export interface FileProcessingResult {
  success: boolean;
  fileId: string;
  conversationsProcessed: number;
  conversationIds: string[];
} 