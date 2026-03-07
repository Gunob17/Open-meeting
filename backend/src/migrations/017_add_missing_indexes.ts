import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Add missing FK indexes on email_uid_map
  if (await knex.schema.hasTable('email_uid_map')) {
    const emailUidMapIndexes = await knex('sqlite_master')
      .where({ type: 'index', tbl_name: 'email_uid_map' })
      .select('name')
      .catch(() => []);
    const emailUidMapIndexNames = emailUidMapIndexes.map((r: any) => r.name);

    if (!emailUidMapIndexNames.includes('idx_email_uid_map_booking_id')) {
      await knex.schema.alterTable('email_uid_map', (table) => {
        table.index(['booking_id'], 'idx_email_uid_map_booking_id');
      });
    }
    if (!emailUidMapIndexNames.includes('idx_email_uid_map_room_id')) {
      if (await knex.schema.hasColumn('email_uid_map', 'room_id')) {
        await knex.schema.alterTable('email_uid_map', (table) => {
          table.index(['room_id'], 'idx_email_uid_map_room_id');
        });
      }
    }
  }

  // Add missing FK index on calendar_tokens.room_id
  if (await knex.schema.hasTable('calendar_tokens')) {
    const calTokenIndexes = await knex('sqlite_master')
      .where({ type: 'index', tbl_name: 'calendar_tokens' })
      .select('name')
      .catch(() => []);
    const calTokenIndexNames = calTokenIndexes.map((r: any) => r.name);

    if (!calTokenIndexNames.includes('idx_calendar_tokens_room_id')) {
      await knex.schema.alterTable('calendar_tokens', (table) => {
        table.index(['room_id'], 'idx_calendar_tokens_room_id');
      });
    }
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
