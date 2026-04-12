import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const tgArchive = sqliteTable('tg_archive', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	attId: integer('att_id').notNull(),
	channelId: integer('channel_id').notNull(),
	tgFileId: text('tg_file_id').notNull(),
	tgMessageId: integer('tg_message_id'),
	tgFileUniqueId: text('tg_file_unique_id'),
	archivedAt: text('archived_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
	cacheCleaned: integer('cache_cleaned').default(0).notNull(),
});
