import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Add soft-delete and deletion-reason columns to users
  if (!(await knex.schema.hasColumn('users', 'deleted_at'))) {
    await knex.schema.alterTable('users', (table) => {
      table.string('deleted_at').nullable();
    });
  }
  if (!(await knex.schema.hasColumn('users', 'deletion_reason'))) {
    await knex.schema.alterTable('users', (table) => {
      table.string('deletion_reason').nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn('users', 'deleted_at')) {
    await knex.schema.alterTable('users', (table) => {
      table.dropColumn('deleted_at');
    });
  }
  if (await knex.schema.hasColumn('users', 'deletion_reason')) {
    await knex.schema.alterTable('users', (table) => {
      table.dropColumn('deletion_reason');
    });
  }
}
