import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Parks table -- add secretariat columns
  if (!(await knex.schema.hasColumn('parks', 'secretariat_email'))) {
    await knex.schema.alterTable('parks', (t) => {
      t.string('secretariat_email', 255).nullable();
    });
  }

  if (!(await knex.schema.hasColumn('parks', 'secretariat_guest_fields'))) {
    await knex.schema.alterTable('parks', (t) => {
      t.text('secretariat_guest_fields').defaultTo('["name"]');
    });
  }

  // Bookings table -- add external_guests column (JSON array)
  if (!(await knex.schema.hasColumn('bookings', 'external_guests'))) {
    await knex.schema.alterTable('bookings', (t) => {
      t.text('external_guests').defaultTo('[]');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn('parks', 'secretariat_email')) {
    await knex.schema.alterTable('parks', (t) => {
      t.dropColumn('secretariat_email');
    });
  }
  if (await knex.schema.hasColumn('parks', 'secretariat_guest_fields')) {
    await knex.schema.alterTable('parks', (t) => {
      t.dropColumn('secretariat_guest_fields');
    });
  }
  if (await knex.schema.hasColumn('bookings', 'external_guests')) {
    await knex.schema.alterTable('bookings', (t) => {
      t.dropColumn('external_guests');
    });
  }
}
