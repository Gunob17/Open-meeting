import { Knex } from 'knex';

/**
 * Security hardening: add indexes on columns used in high-frequency queries
 * that previously required full-table scans.
 *
 * 1. email_rate_limits.window_start — scanned during purge of expired windows
 * 2. email_uid_map.booking_id      — looked up when a booking is cancelled/deleted
 * 3. email_uid_map.room_id         — looked up during IMAP worker restart per room
 */
export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable('email_rate_limits')) {
    await knex.schema.alterTable('email_rate_limits', (table) => {
      table.index(['window_start'], 'idx_email_rate_limits_window_start');
    });
  }

  if (await knex.schema.hasTable('email_uid_map')) {
    await knex.schema.alterTable('email_uid_map', (table) => {
      table.index(['booking_id'], 'idx_email_uid_map_booking_id');
      table.index(['room_id'], 'idx_email_uid_map_room_id');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable('email_rate_limits')) {
    await knex.schema.alterTable('email_rate_limits', (table) => {
      table.dropIndex(['window_start'], 'idx_email_rate_limits_window_start');
    });
  }

  if (await knex.schema.hasTable('email_uid_map')) {
    await knex.schema.alterTable('email_uid_map', (table) => {
      table.dropIndex(['booking_id'], 'idx_email_uid_map_booking_id');
      table.dropIndex(['room_id'], 'idx_email_uid_map_room_id');
    });
  }
}
