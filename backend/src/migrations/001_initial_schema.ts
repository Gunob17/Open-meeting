import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Parks
  if (!(await knex.schema.hasTable('parks'))) {
    await knex.schema.createTable('parks', (table) => {
      table.string('id').primary();
      table.string('name').notNullable();
      table.string('address').notNullable();
      table.text('description').defaultTo('');
      table.string('logo_url').nullable();
      table.boolean('is_active').defaultTo(true);
      table.string('created_at').defaultTo(knex.fn.now());
      table.string('updated_at').defaultTo(knex.fn.now());
    });
  } else {
    // Ensure columns exist for existing SQLite databases
    if (!(await knex.schema.hasColumn('parks', 'logo_url'))) {
      await knex.schema.alterTable('parks', (table) => {
        table.string('logo_url').nullable();
      });
    }
  }

  // Companies
  if (!(await knex.schema.hasTable('companies'))) {
    await knex.schema.createTable('companies', (table) => {
      table.string('id').primary();
      table.string('name').notNullable();
      table.string('address').notNullable();
      table.string('park_id').defaultTo('default');
      table.string('created_at').defaultTo(knex.fn.now());
      table.string('updated_at').defaultTo(knex.fn.now());
      table.index('park_id', 'idx_companies_park_id');
    });
  } else {
    if (!(await knex.schema.hasColumn('companies', 'park_id'))) {
      await knex.schema.alterTable('companies', (table) => {
        table.string('park_id').defaultTo('default');
      });
    }
  }

  // Users
  if (!(await knex.schema.hasTable('users'))) {
    await knex.schema.createTable('users', (table) => {
      table.string('id').primary();
      table.string('email').unique().notNullable();
      table.string('password').notNullable();
      table.string('name').notNullable();
      table.string('role').notNullable();
      table.string('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
      table.string('park_id').nullable();
      table.string('created_at').defaultTo(knex.fn.now());
      table.string('updated_at').defaultTo(knex.fn.now());
      table.index('company_id', 'idx_users_company_id');
      table.index('email', 'idx_users_email');
      table.index('park_id', 'idx_users_park_id');
    });
  } else {
    if (!(await knex.schema.hasColumn('users', 'park_id'))) {
      await knex.schema.alterTable('users', (table) => {
        table.string('park_id').nullable();
      });
    }
  }

  // Meeting rooms
  if (!(await knex.schema.hasTable('meeting_rooms'))) {
    await knex.schema.createTable('meeting_rooms', (table) => {
      table.string('id').primary();
      table.string('name').notNullable();
      table.integer('capacity').notNullable();
      table.text('amenities').notNullable().defaultTo('[]');
      table.string('floor').notNullable();
      table.string('address').notNullable();
      table.text('description').defaultTo('');
      table.boolean('is_active').defaultTo(true);
      table.string('park_id').defaultTo('default');
      table.integer('opening_hour').nullable();
      table.integer('closing_hour').nullable();
      table.text('locked_to_company_id').nullable();
      table.text('quick_book_durations').defaultTo('[30, 60, 90, 120]');
      table.string('created_at').defaultTo(knex.fn.now());
      table.string('updated_at').defaultTo(knex.fn.now());
      table.index('park_id', 'idx_meeting_rooms_park_id');
    });
  } else {
    const addColumnIfMissing = async (col: string, cb: (table: Knex.AlterTableBuilder) => void) => {
      if (!(await knex.schema.hasColumn('meeting_rooms', col))) {
        await knex.schema.alterTable('meeting_rooms', cb);
      }
    };
    await addColumnIfMissing('opening_hour', (t) => t.integer('opening_hour').nullable());
    await addColumnIfMissing('closing_hour', (t) => t.integer('closing_hour').nullable());
    await addColumnIfMissing('locked_to_company_id', (t) => t.text('locked_to_company_id').nullable());
    await addColumnIfMissing('quick_book_durations', (t) => t.text('quick_book_durations').defaultTo('[30, 60, 90, 120]'));
    await addColumnIfMissing('park_id', (t) => t.string('park_id').defaultTo('default'));
  }

  // Bookings
  if (!(await knex.schema.hasTable('bookings'))) {
    await knex.schema.createTable('bookings', (table) => {
      table.string('id').primary();
      table.string('room_id').notNullable().references('id').inTable('meeting_rooms').onDelete('CASCADE');
      table.string('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('title').notNullable();
      table.text('description').defaultTo('');
      table.string('start_time').notNullable();
      table.string('end_time').notNullable();
      table.text('attendees').notNullable().defaultTo('[]');
      table.string('status').notNullable().defaultTo('confirmed');
      table.string('created_at').defaultTo(knex.fn.now());
      table.string('updated_at').defaultTo(knex.fn.now());
      table.index('room_id', 'idx_bookings_room_id');
      table.index('user_id', 'idx_bookings_user_id');
      table.index('start_time', 'idx_bookings_start_time');
      table.index('end_time', 'idx_bookings_end_time');
    });
  }

  // Settings
  if (!(await knex.schema.hasTable('settings'))) {
    await knex.schema.createTable('settings', (table) => {
      table.string('id').primary().defaultTo('global');
      table.integer('opening_hour').notNullable().defaultTo(8);
      table.integer('closing_hour').notNullable().defaultTo(18);
      table.string('updated_at').defaultTo(knex.fn.now());
    });
  }

  // Devices
  if (!(await knex.schema.hasTable('devices'))) {
    await knex.schema.createTable('devices', (table) => {
      table.string('id').primary();
      table.string('name').notNullable();
      table.string('token').unique().notNullable();
      table.string('room_id').notNullable().references('id').inTable('meeting_rooms').onDelete('CASCADE');
      table.string('device_type').notNullable().defaultTo('esp32-display');
      table.boolean('is_active').defaultTo(true);
      table.string('last_seen_at').nullable();
      table.string('firmware_version').nullable();
      table.string('pending_firmware_version').nullable();
      table.string('created_at').defaultTo(knex.fn.now());
      table.string('updated_at').defaultTo(knex.fn.now());
      table.index('token', 'idx_devices_token');
      table.index('room_id', 'idx_devices_room_id');
      table.index('device_type', 'idx_devices_type');
    });
  } else {
    const addDeviceCol = async (col: string, cb: (table: Knex.AlterTableBuilder) => void) => {
      if (!(await knex.schema.hasColumn('devices', col))) {
        await knex.schema.alterTable('devices', cb);
      }
    };
    await addDeviceCol('firmware_version', (t) => t.string('firmware_version').nullable());
    await addDeviceCol('pending_firmware_version', (t) => t.string('pending_firmware_version').nullable());
    await addDeviceCol('device_type', (t) => t.string('device_type').defaultTo('esp32-display'));
  }

  // Firmware
  if (!(await knex.schema.hasTable('firmware'))) {
    await knex.schema.createTable('firmware', (table) => {
      table.string('id').primary();
      table.string('version').notNullable();
      table.string('device_type').notNullable().defaultTo('esp32-display');
      table.string('filename').notNullable();
      table.integer('size').notNullable();
      table.string('checksum').notNullable();
      table.text('release_notes').defaultTo('');
      table.boolean('is_active').defaultTo(true);
      table.string('created_at').defaultTo(knex.fn.now());
      table.unique(['version', 'device_type']);
      table.index('version', 'idx_firmware_version');
      table.index('device_type', 'idx_firmware_type');
    });
  } else {
    if (!(await knex.schema.hasColumn('firmware', 'device_type'))) {
      await knex.schema.alterTable('firmware', (table) => {
        table.string('device_type').defaultTo('esp32-display');
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('firmware');
  await knex.schema.dropTableIfExists('devices');
  await knex.schema.dropTableIfExists('settings');
  await knex.schema.dropTableIfExists('bookings');
  await knex.schema.dropTableIfExists('meeting_rooms');
  await knex.schema.dropTableIfExists('users');
  await knex.schema.dropTableIfExists('companies');
  await knex.schema.dropTableIfExists('parks');
}
