import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn('users', 'has_seen_tour'))) {
    await knex.schema.alterTable('users', (table) => {
      // Default true so existing users are not shown the tour on their next login
      table.boolean('has_seen_tour').notNullable().defaultTo(true);
    });
    // New users created after this migration will have has_seen_tour = false
    // (set explicitly in createInvited / createFromSso)
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn('users', 'has_seen_tour')) {
    await knex.schema.alterTable('users', (table) => {
      table.dropColumn('has_seen_tour');
    });
  }
}
