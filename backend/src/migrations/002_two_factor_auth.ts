import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Users table -- add 2FA columns
  const addUserCol = async (col: string, cb: (table: Knex.AlterTableBuilder) => void) => {
    if (!(await knex.schema.hasColumn('users', col))) {
      await knex.schema.alterTable('users', cb);
    }
  };
  await addUserCol('twofa_secret', (t) => t.string('twofa_secret', 255).nullable());
  await addUserCol('twofa_enabled', (t) => t.boolean('twofa_enabled').defaultTo(false));
  await addUserCol('twofa_backup_codes', (t) => t.text('twofa_backup_codes').nullable());

  // Settings table -- add 2FA settings columns
  const addSettingsCol = async (col: string, cb: (table: Knex.AlterTableBuilder) => void) => {
    if (!(await knex.schema.hasColumn('settings', col))) {
      await knex.schema.alterTable('settings', cb);
    }
  };
  await addSettingsCol('twofa_enforcement', (t) => t.string('twofa_enforcement', 20).defaultTo('disabled'));
  await addSettingsCol('twofa_mode', (t) => t.string('twofa_mode', 20).defaultTo('trusted_device'));
  await addSettingsCol('twofa_trusted_device_days', (t) => t.integer('twofa_trusted_device_days').defaultTo(30));

  // Parks table -- add 2FA enforcement column
  if (!(await knex.schema.hasColumn('parks', 'twofa_enforcement'))) {
    await knex.schema.alterTable('parks', (t) => {
      t.string('twofa_enforcement', 20).defaultTo('inherit');
    });
  }

  // Companies table -- add 2FA enforcement column
  if (!(await knex.schema.hasColumn('companies', 'twofa_enforcement'))) {
    await knex.schema.alterTable('companies', (t) => {
      t.string('twofa_enforcement', 20).defaultTo('inherit');
    });
  }

  // Trusted devices table
  if (!(await knex.schema.hasTable('trusted_devices'))) {
    await knex.schema.createTable('trusted_devices', (table) => {
      table.string('id').primary();
      table.string('user_id').notNullable()
        .references('id').inTable('users').onDelete('CASCADE');
      table.string('device_token', 255).unique().notNullable();
      table.string('device_name', 255).notNullable();
      table.string('ip_address', 45).nullable();
      table.string('expires_at').notNullable();
      table.string('created_at').defaultTo(knex.fn.now());
      table.index('user_id', 'idx_trusted_devices_user_id');
      table.index('device_token', 'idx_trusted_devices_token');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('trusted_devices');
}
