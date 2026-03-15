import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn('desks', 'features'))) {
    await knex.schema.alterTable('desks', (table) => {
      table.text('features').nullable(); // JSON string array, e.g. '["Standing Desk","Dual Monitor"]'
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn('desks', 'features')) {
    await knex.schema.alterTable('desks', (table) => {
      table.dropColumn('features');
    });
  }
}
