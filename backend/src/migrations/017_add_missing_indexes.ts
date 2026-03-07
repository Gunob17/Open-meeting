import { Knex } from 'knex';

async function tryCreateIndex(knex: Knex, table: string, columns: string[], indexName: string): Promise<void> {
  try {
    await knex.schema.alterTable(table, (t) => {
      t.index(columns, indexName);
    });
  } catch (err: any) {
    // Ignore if index already exists (MySQL: ER_DUP_KEYNAME, SQLite: already exists message)
    const msg: string = err?.message ?? '';
    if (err?.code !== 'ER_DUP_KEYNAME' && !msg.includes('already exists') && !msg.includes('Duplicate')) {
      throw err;
    }
  }
}

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable('email_uid_map')) {
    await tryCreateIndex(knex, 'email_uid_map', ['booking_id'], 'idx_email_uid_map_booking_id');
    if (await knex.schema.hasColumn('email_uid_map', 'room_id')) {
      await tryCreateIndex(knex, 'email_uid_map', ['room_id'], 'idx_email_uid_map_room_id');
    }
  }

  if (await knex.schema.hasTable('calendar_tokens')) {
    await tryCreateIndex(knex, 'calendar_tokens', ['room_id'], 'idx_calendar_tokens_room_id');
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable('email_uid_map')) {
    await knex.schema.alterTable('email_uid_map', (table) => {
      table.dropIndex([], 'idx_email_uid_map_booking_id');
      table.dropIndex([], 'idx_email_uid_map_room_id');
    }).catch(() => {});
  }
  if (await knex.schema.hasTable('calendar_tokens')) {
    await knex.schema.alterTable('calendar_tokens', (table) => {
      table.dropIndex([], 'idx_calendar_tokens_room_id');
    }).catch(() => {});
  }
}
