import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable('users')) {
    if (!(await knex.schema.hasColumn('users', 'invite_token'))) {
      await knex.schema.alterTable('users', (t) => {
        t.string('invite_token', 64).nullable().unique();
      });
    }
    if (!(await knex.schema.hasColumn('users', 'invite_token_expiry'))) {
      await knex.schema.alterTable('users', (t) => {
        t.string('invite_token_expiry', 30).nullable();
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable('users')) {
    if (await knex.schema.hasColumn('users', 'invite_token')) {
      await knex.schema.alterTable('users', (t) => {
        t.dropColumn('invite_token');
      });
    }
    if (await knex.schema.hasColumn('users', 'invite_token_expiry')) {
      await knex.schema.alterTable('users', (t) => {
        t.dropColumn('invite_token_expiry');
      });
    }
  }
}
