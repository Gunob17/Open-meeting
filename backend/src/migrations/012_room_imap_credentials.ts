import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Add per-room IMAP credentials to meeting_rooms
  if (!(await knex.schema.hasColumn('meeting_rooms', 'imap_host'))) {
    await knex.schema.alterTable('meeting_rooms', (table) => {
      table.string('imap_host', 253).nullable();
    });
  }
  if (!(await knex.schema.hasColumn('meeting_rooms', 'imap_port'))) {
    await knex.schema.alterTable('meeting_rooms', (table) => {
      table.integer('imap_port').nullable();
    });
  }
  if (!(await knex.schema.hasColumn('meeting_rooms', 'imap_user'))) {
    await knex.schema.alterTable('meeting_rooms', (table) => {
      table.string('imap_user', 254).nullable();
    });
  }
  if (!(await knex.schema.hasColumn('meeting_rooms', 'imap_pass'))) {
    await knex.schema.alterTable('meeting_rooms', (table) => {
      table.text('imap_pass').nullable();
    });
  }
  if (!(await knex.schema.hasColumn('meeting_rooms', 'imap_mailbox'))) {
    await knex.schema.alterTable('meeting_rooms', (table) => {
      table.string('imap_mailbox', 255).nullable();
    });
  }

  // UID tracking table: maps iCal event UIDs to bookings so that
  // a follow-up REQUEST with a higher SEQUENCE updates the existing booking
  // rather than creating a duplicate.
  if (!(await knex.schema.hasTable('email_uid_map'))) {
    await knex.schema.createTable('email_uid_map', (table) => {
      table.string('ical_uid', 500).primary(); // 500 chars × 4 bytes (utf8mb4) = 2000 bytes < MySQL 3072-byte key limit
      table.uuid('booking_id').notNullable();
      table.integer('sequence').notNullable().defaultTo(0);
      table.uuid('room_id').notNullable();
      table.string('created_at').notNullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  for (const col of ['imap_host', 'imap_port', 'imap_user', 'imap_pass', 'imap_mailbox']) {
    if (await knex.schema.hasColumn('meeting_rooms', col)) {
      await knex.schema.alterTable('meeting_rooms', (table) => {
        table.dropColumn(col);
      });
    }
  }

  if (await knex.schema.hasTable('email_uid_map')) {
    await knex.schema.dropTable('email_uid_map');
  }
}
