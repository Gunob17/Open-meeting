import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // calendar_tokens table
  if (!(await knex.schema.hasTable('calendar_tokens'))) {
    await knex.schema.createTable('calendar_tokens', (table) => {
      table.string('id').primary();
      table.string('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('scope', 20).notNullable(); // 'my_bookings' | 'room'
      table.string('room_id').nullable().references('id').inTable('meeting_rooms').onDelete('CASCADE');
      table.string('token_hash', 64).notNullable().unique(); // SHA-256 hex (32 bytes = 64 hex chars)
      table.string('label', 100).nullable();
      table.string('created_at').notNullable();
      table.string('last_used_at').nullable();
      table.string('expires_at').nullable();

      table.index(['user_id'], 'idx_calendar_tokens_user_id');
      table.index(['token_hash'], 'idx_calendar_tokens_token_hash');
    });
  }

  // Add calendar_feed_enabled to parks
  if (!(await knex.schema.hasColumn('parks', 'calendar_feed_enabled'))) {
    await knex.schema.alterTable('parks', (table) => {
      table.boolean('calendar_feed_enabled').notNullable().defaultTo(true);
    });
  }

  // Add calendar_feed_enabled to meeting_rooms
  if (!(await knex.schema.hasColumn('meeting_rooms', 'calendar_feed_enabled'))) {
    await knex.schema.alterTable('meeting_rooms', (table) => {
      table.boolean('calendar_feed_enabled').notNullable().defaultTo(true);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('calendar_tokens');

  if (await knex.schema.hasColumn('parks', 'calendar_feed_enabled')) {
    await knex.schema.alterTable('parks', (table) => {
      table.dropColumn('calendar_feed_enabled');
    });
  }

  if (await knex.schema.hasColumn('meeting_rooms', 'calendar_feed_enabled')) {
    await knex.schema.alterTable('meeting_rooms', (table) => {
      table.dropColumn('calendar_feed_enabled');
    });
  }
}
