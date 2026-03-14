import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('desks'))) {
    await knex.schema.createTable('desks', (table) => {
      table.string('id').primary();
      table.string('park_id').notNullable().references('id').inTable('parks').onDelete('CASCADE');
      table.string('name', 255).notNullable();
      table.text('description').nullable();
      table.string('floor', 100).nullable();
      table.boolean('is_active').notNullable().defaultTo(true);
      table.string('quota_type', 20).nullable(); // 'per_user' | 'per_company'
      table.integer('monthly_quota').nullable();  // null = unlimited
      table.string('created_at').notNullable();
      table.string('updated_at').notNullable();

      table.index(['park_id'], 'idx_desks_park_id');
      table.index(['park_id', 'is_active'], 'idx_desks_park_active');
    });
  }

  if (!(await knex.schema.hasTable('desk_bookings'))) {
    await knex.schema.createTable('desk_bookings', (table) => {
      table.string('id').primary();
      table.string('desk_id').notNullable().references('id').inTable('desks').onDelete('CASCADE');
      table.string('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('booking_date', 10).notNullable(); // 'YYYY-MM-DD'
      table.string('status', 20).notNullable().defaultTo('confirmed');
      table.string('created_at').notNullable();
      table.string('updated_at').notNullable();

      table.index(['desk_id'], 'idx_desk_bookings_desk_id');
      table.index(['user_id'], 'idx_desk_bookings_user_id');
      table.index(['booking_date'], 'idx_desk_bookings_date');
      table.index(['desk_id', 'booking_date', 'status'], 'idx_desk_bookings_desk_date_status');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('desk_bookings');
  await knex.schema.dropTableIfExists('desks');
}
