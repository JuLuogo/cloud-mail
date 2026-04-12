import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const tgChannel = sqliteTable('tg_channel', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	chatId: text('chat_id').notNull(),
	name: text('name').default('').notNull(),
	type: integer('type').default(0).notNull(),
	mediaFilter: integer('media_filter').default(0).notNull(),
	maxSize: integer('max_size').default(0).notNull(),
	archiveEnabled: integer('archive_enabled').default(0).notNull(),
	archiveDays: integer('archive_days').default(7).notNull(),
	enabled: integer('enabled').default(1).notNull(),
	priority: integer('priority').default(0).notNull(),
	createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});
