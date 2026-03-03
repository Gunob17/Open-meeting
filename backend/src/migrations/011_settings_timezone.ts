import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn('settings', 'timezone'))) {
    await knex.schema.alterTable('settings', (table) => {
      table.string('timezone').notNullable().defaultTo('UTC');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn('settings', 'timezone')) {
    await knex.schema.alterTable('settings', (table) => {
      table.dropColumn('timezone');
    });
  }
}
