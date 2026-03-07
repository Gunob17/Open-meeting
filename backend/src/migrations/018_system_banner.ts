import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn('settings', 'banner_enabled'))) {
    await knex.schema.alterTable('settings', (table) => {
      table.boolean('banner_enabled').notNullable().defaultTo(false);
      table.text('banner_message').nullable();
      table.string('banner_level', 20).notNullable().defaultTo('info');
      table.string('banner_starts_at').nullable();
      table.string('banner_ends_at').nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn('settings', 'banner_enabled')) {
    await knex.schema.alterTable('settings', (table) => {
      table.dropColumn('banner_enabled');
      table.dropColumn('banner_message');
      table.dropColumn('banner_level');
      table.dropColumn('banner_starts_at');
      table.dropColumn('banner_ends_at');
    });
  }
}
