import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Add addon_roles JSON array column to users table
  if (!(await knex.schema.hasColumn('users', 'addon_roles'))) {
    await knex.schema.alterTable('users', (t) => {
      t.text('addon_roles').defaultTo('[]');
    });
  }

  // Add reception columns to parks (rename from secretariat)
  if (!(await knex.schema.hasColumn('parks', 'reception_email'))) {
    await knex.schema.alterTable('parks', (t) => {
      t.string('reception_email', 255).nullable();
    });
    // Copy data from old secretariat_email column if it exists
    if (await knex.schema.hasColumn('parks', 'secretariat_email')) {
      await knex.raw('UPDATE parks SET reception_email = secretariat_email WHERE secretariat_email IS NOT NULL');
    }
  }

  if (!(await knex.schema.hasColumn('parks', 'reception_guest_fields'))) {
    await knex.schema.alterTable('parks', (t) => {
      t.text('reception_guest_fields').defaultTo('["name"]');
    });
    // Copy data from old secretariat_guest_fields column if it exists
    if (await knex.schema.hasColumn('parks', 'secretariat_guest_fields')) {
      await knex.raw('UPDATE parks SET reception_guest_fields = secretariat_guest_fields WHERE secretariat_guest_fields IS NOT NULL');
    }
  }

  // Create guest_visits table for check-in/check-out tracking
  if (!(await knex.schema.hasTable('guest_visits'))) {
    await knex.schema.createTable('guest_visits', (t) => {
      t.string('id', 36).primary();
      t.string('booking_id', 36).notNullable()
        .references('id').inTable('bookings').onDelete('CASCADE');
      t.string('guest_name', 255).notNullable();
      t.string('guest_email', 254).nullable();
      t.string('guest_company', 255).nullable();
      t.string('expected_arrival', 255).notNullable();
      t.string('checked_in_at', 255).nullable();
      t.string('checked_out_at', 255).nullable();
      t.string('checked_in_by', 36).nullable();
      t.string('checked_out_by', 36).nullable();
      t.string('created_at', 255).notNullable();
      t.index('booking_id', 'idx_guest_visits_booking_id');
      t.index('expected_arrival', 'idx_guest_visits_expected_arrival');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable('guest_visits')) {
    await knex.schema.dropTable('guest_visits');
  }
  if (await knex.schema.hasColumn('parks', 'reception_email')) {
    await knex.schema.alterTable('parks', (t) => {
      t.dropColumn('reception_email');
    });
  }
  if (await knex.schema.hasColumn('parks', 'reception_guest_fields')) {
    await knex.schema.alterTable('parks', (t) => {
      t.dropColumn('reception_guest_fields');
    });
  }
  if (await knex.schema.hasColumn('users', 'addon_roles')) {
    await knex.schema.alterTable('users', (t) => {
      t.dropColumn('addon_roles');
    });
  }
}
