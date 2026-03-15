import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn('companies', 'desk_booking_enabled'))) {
    await knex.schema.alterTable('companies', (table) => {
      table.boolean('desk_booking_enabled').notNullable().defaultTo(false);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn('companies', 'desk_booking_enabled')) {
    await knex.schema.alterTable('companies', (table) => {
      table.dropColumn('desk_booking_enabled');
    });
  }
}
