import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn('parks', 'week_start_day'))) {
    await knex.schema.alterTable('parks', (table) => {
      // 0=Sunday, 1=Monday (default), 2=Tuesday … 6=Saturday
      table.integer('week_start_day').notNullable().defaultTo(1);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  // SQLite doesn't support DROP COLUMN — intentionally left as no-op
}
