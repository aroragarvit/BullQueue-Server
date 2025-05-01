import { pgTable, uuid, text, timestamp, boolean, pgSchema, jsonb } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const authSchema = pgSchema('auth');

export const users = authSchema.table('users', {
  id: uuid('id').primaryKey().notNull(),
  email: text('email').notNull(),
  emailConfirmedAt: timestamp('email_confirmed_at', { withTimezone: true, mode: 'string' }),
  lastSignInAt: timestamp('last_sign_in_at', { withTimezone: true, mode: 'string' }),
  rawAppMetaData: text('raw_app_meta_data'),
  rawUserMetaData: text('raw_user_meta_data'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull(),
  phone: text('phone'),
  phoneConfirmed: boolean('phone_confirmed'),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true, mode: 'string' }),
  emailChange: text('email_change'),
  emailChangeSentAt: timestamp('email_change_sent_at', { withTimezone: true, mode: 'string' }),
  banned: boolean('banned'),
  aud: text('aud'),
  role: text('role'),
});

export const files = pgTable('files', {
  id: uuid('id')
    .default(sql`uuid_generate_v4()`)
    .primaryKey()
    .notNull(),
  fileName: text('file_name').notNull(),
  fileUrl: text('file_url').notNull(),
  notes: text('notes'),
  synced: boolean('synced').notNull().default(false),
  createdAt: timestamp('created_at', {
    withTimezone: true,
    mode: 'string',
  }).defaultNow(),
  updatedAt: timestamp('updated_at', {
    withTimezone: true,
    mode: 'string',
  }).defaultNow(),
});

export const conversations = pgTable('conversations', {
  id: uuid('id')
    .default(sql`uuid_generate_v4()`)
    .primaryKey()
    .notNull(),
  messages: jsonb('conversation').notNull(),
  deleted: boolean('deleted').default(false),
  edited: boolean('edited').default(false),
  createdAt: timestamp('created_at', {
    withTimezone: true,
    mode: 'string',
  }).defaultNow(),
  updatedAt: timestamp('updated_at', {
    withTimezone: true,
    mode: 'string',
  }).defaultNow(),
});

export const fileConversations = pgTable('file_conversations', {
  id: uuid('id')
    .default(sql`uuid_generate_v4()`)
    .primaryKey()
    .notNull(),
  fileId: uuid('file_id')
    .notNull()
    .references(() => files.id),
  conversationId: uuid('conversation_id')
    .notNull()
    .references(() => conversations.id),
  createdAt: timestamp('created_at', {
    withTimezone: true,
    mode: 'string',
  }).defaultNow(),
}); 