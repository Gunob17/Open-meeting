import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn('settings', 'time_format'))) {
    await knex.schema.alterTable('settings', (table) => {
      table.string('time_format').notNullable().defaultTo('12h');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn('settings', 'time_format')) {
    await knex.schema.alterTable('settings', (table) => {
      table.dropColumn('time_format');
    });
  }
}
