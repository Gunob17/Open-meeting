import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create ldap_configs table
  if (!(await knex.schema.hasTable('ldap_configs'))) {
    await knex.schema.createTable('ldap_configs', (t) => {
      t.string('id', 36).primary();
      t.string('company_id', 36).notNullable().unique()
        .references('id').inTable('companies').onDelete('CASCADE');
      t.boolean('is_enabled').defaultTo(false);
      t.string('server_url', 512).notNullable();
      t.string('bind_dn', 512).notNullable();
      t.text('bind_password_encrypted').notNullable();
      t.string('search_base', 512).notNullable();
      t.string('user_filter', 512).defaultTo('(objectClass=inetOrgPerson)');
      t.string('username_attribute', 100).defaultTo('uid');
      t.string('email_attribute', 100).defaultTo('mail');
      t.string('name_attribute', 100).defaultTo('cn');
      t.string('group_search_base', 512).nullable();
      t.string('group_filter', 512).nullable();
      t.string('group_member_attribute', 100).defaultTo('member');
      t.text('role_mappings').defaultTo('[]');
      t.string('default_role', 50).defaultTo('user');
      t.integer('sync_interval_hours').defaultTo(24);
      t.string('last_sync_at').nullable();
      t.string('last_sync_status', 20).nullable();
      t.text('last_sync_message').nullable();
      t.integer('last_sync_user_count').nullable();
      t.boolean('use_starttls').defaultTo(false);
      t.boolean('tls_reject_unauthorized').defaultTo(true);
      t.integer('connection_timeout_ms').defaultTo(10000);
      t.string('created_at').notNullable();
      t.string('updated_at').notNullable();
      t.index('company_id', 'idx_ldap_configs_company_id');
    });
  }

  // Add LDAP-related columns to users table
  if (!(await knex.schema.hasColumn('users', 'is_active'))) {
    await knex.schema.alterTable('users', (t) => {
      t.boolean('is_active').defaultTo(true);
    });
  }

  if (!(await knex.schema.hasColumn('users', 'auth_source'))) {
    await knex.schema.alterTable('users', (t) => {
      t.string('auth_source', 20).defaultTo('local');
    });
  }

  if (!(await knex.schema.hasColumn('users', 'ldap_dn'))) {
    await knex.schema.alterTable('users', (t) => {
      t.string('ldap_dn', 512).nullable();
    });
  }

  if (!(await knex.schema.hasColumn('users', 'ldap_synced_at'))) {
    await knex.schema.alterTable('users', (t) => {
      t.string('ldap_synced_at').nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable('ldap_configs')) {
    await knex.schema.dropTable('ldap_configs');
  }
  if (await knex.schema.hasColumn('users', 'is_active')) {
    await knex.schema.alterTable('users', (t) => { t.dropColumn('is_active'); });
  }
  if (await knex.schema.hasColumn('users', 'auth_source')) {
    await knex.schema.alterTable('users', (t) => { t.dropColumn('auth_source'); });
  }
  if (await knex.schema.hasColumn('users', 'ldap_dn')) {
    await knex.schema.alterTable('users', (t) => { t.dropColumn('ldap_dn'); });
  }
  if (await knex.schema.hasColumn('users', 'ldap_synced_at')) {
    await knex.schema.alterTable('users', (t) => { t.dropColumn('ldap_synced_at'); });
  }
}
