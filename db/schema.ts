import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const monitorState = sqliteTable('monitor_state', {
  id: integer('id').primaryKey(), snapshot: text('snapshot').notNull(), lockToken: text('lock_token'), lockUntil: integer('lock_until').notNull().default(0), nextAllowedAt: integer('next_allowed_at').notNull().default(0), lastAttemptAt: text('last_attempt_at'), lastSuccessAt: text('last_success_at'), catalogVerifiedAt: text('catalog_verified_at'), backgroundEnabled: integer('background_enabled').notNull().default(0), lastBackgroundAt: text('last_background_at'),
});
export const monitorRuns = sqliteTable('monitor_runs', { id:text('id').primaryKey(), at:text('at').notNull(), outcome:text('outcome').notNull(), detail:text('detail').notNull() });
