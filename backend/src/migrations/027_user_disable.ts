import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasDisabledUntil = await knex.schema.hasColumn('users', 'disabled_until');
  if (!hasDisabledUntil) {
    await knex.schema.table('users', (table) => {
      table.dateTime('disabled_until').nullable().defaultTo(null);
      table.text('disable_reason').nullable().defaultTo(null);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasDisabledUntil = await knex.schema.hasColumn('users', 'disabled_until');
  if (hasDisabledUntil) {
    await knex.schema.table('users', (table) => {
      table.dropColumn('disabled_until');
      table.dropColumn('disable_reason');
    });
  }
}
