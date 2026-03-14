import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Add park-level desk quota defaults
  if (!(await knex.schema.hasColumn('parks', 'desk_quota_type'))) {
    await knex.schema.alterTable('parks', (table) => {
      table.string('desk_quota_type', 20).nullable(); // 'per_user' | 'per_company'
    });
  }
  if (!(await knex.schema.hasColumn('parks', 'monthly_desk_quota'))) {
    await knex.schema.alterTable('parks', (table) => {
      table.integer('monthly_desk_quota').nullable(); // null = unlimited
    });
  }

  // Per-user override table (park + user level)
  if (!(await knex.schema.hasTable('user_desk_quotas'))) {
    await knex.schema.createTable('user_desk_quotas', (table) => {
      table.string('id').primary();
      table.string('park_id').notNullable().references('id').inTable('parks').onDelete('CASCADE');
      table.string('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.integer('monthly_quota').notNullable();
      table.string('created_at').notNullable();
      table.string('updated_at').notNullable();

      table.unique(['park_id', 'user_id'], { indexName: 'uq_user_desk_quotas_park_user' });
      table.index(['park_id'], 'idx_user_desk_quotas_park_id');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('user_desk_quotas');
  // SQLite doesn't support DROP COLUMN — leave desk_quota_type and monthly_desk_quota on parks
}
