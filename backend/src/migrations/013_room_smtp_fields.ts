import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Optional SMTP host override — if null, falls back to imap_host for sending replies
  if (!(await knex.schema.hasColumn('meeting_rooms', 'smtp_host'))) {
    await knex.schema.alterTable('meeting_rooms', (table) => {
      table.string('smtp_host', 253).nullable();
    });
  }
  // SMTP port (default 587 = STARTTLS, 465 = SSL)
  if (!(await knex.schema.hasColumn('meeting_rooms', 'smtp_port'))) {
    await knex.schema.alterTable('meeting_rooms', (table) => {
      table.integer('smtp_port').nullable();
    });
  }
  // Whether to use SSL/TLS directly (true = port 465), false = STARTTLS (port 587)
  if (!(await knex.schema.hasColumn('meeting_rooms', 'smtp_secure'))) {
    await knex.schema.alterTable('meeting_rooms', (table) => {
      table.boolean('smtp_secure').nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  for (const col of ['smtp_host', 'smtp_port', 'smtp_secure']) {
    if (await knex.schema.hasColumn('meeting_rooms', col)) {
      await knex.schema.alterTable('meeting_rooms', (table) => {
        table.dropColumn(col);
      });
    }
  }
}
