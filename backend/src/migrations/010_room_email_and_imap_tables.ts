import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Add optional booking-by-email address to rooms
  if (!(await knex.schema.hasColumn('meeting_rooms', 'booking_email'))) {
    await knex.schema.alterTable('meeting_rooms', (table) => {
      table.string('booking_email', 254).nullable().unique();
    });
  }

  // Deduplication table: track processed email Message-IDs to prevent replay attacks
  if (!(await knex.schema.hasTable('email_dedup'))) {
    await knex.schema.createTable('email_dedup', (table) => {
      table.string('message_id', 500).primary(); // 500 chars × 4 bytes (utf8mb4) = 2000 bytes < MySQL 3072-byte key limit
      table.string('processed_at').notNullable();
    });
  }

  // Rate-limit table: cap booking attempts per sender per rolling hour window
  if (!(await knex.schema.hasTable('email_rate_limits'))) {
    await knex.schema.createTable('email_rate_limits', (table) => {
      table.string('sender_email', 254).primary();
      table.integer('attempt_count').notNullable().defaultTo(0);
      table.string('window_start').notNullable(); // ISO timestamp of window start
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn('meeting_rooms', 'booking_email')) {
    await knex.schema.alterTable('meeting_rooms', (table) => {
      table.dropColumn('booking_email');
    });
  }

  if (await knex.schema.hasTable('email_rate_limits')) {
    await knex.schema.dropTable('email_rate_limits');
  }

  if (await knex.schema.hasTable('email_dedup')) {
    await knex.schema.dropTable('email_dedup');
  }
}
