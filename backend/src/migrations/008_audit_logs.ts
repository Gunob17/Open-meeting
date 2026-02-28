import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('audit_logs'))) {
    await knex.schema.createTable('audit_logs', (table) => {
      table.string('id').primary();
      table.string('timestamp').notNullable();
      table.string('user_id').nullable(); // null for unauthenticated actions
      table.string('action').notNullable(); // e.g. auth.login.success
      table.string('resource_type').nullable(); // e.g. booking, user, invite
      table.string('resource_id').nullable();
      table.string('ip_address').nullable();
      table.string('user_agent').nullable();
      table.string('outcome').notNullable(); // success | failure
      table.text('metadata').nullable(); // JSON string for extra context
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('audit_logs');
}
