import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn('companies', 'setup_pending'))) {
    await knex.schema.alterTable('companies', (table) => {
      // Existing companies are fully set up; only auto-created ones need completion
      table.boolean('setup_pending').notNullable().defaultTo(false);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn('companies', 'setup_pending')) {
    await knex.schema.alterTable('companies', (table) => {
      table.dropColumn('setup_pending');
    });
  }
}
