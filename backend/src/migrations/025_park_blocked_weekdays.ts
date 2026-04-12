import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn('parks', 'blocked_weekdays'))) {
    await knex.schema.alterTable('parks', (table) => {
      // JSON array of ints 0-6 (0=Sunday … 6=Saturday). Default empty = no blocked days.
      table.text('blocked_weekdays').notNullable().defaultTo('[]');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  // SQLite doesn't support DROP COLUMN — intentionally left as no-op
}
