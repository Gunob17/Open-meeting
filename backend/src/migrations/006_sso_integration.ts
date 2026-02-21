import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create sso_configs table
  if (!(await knex.schema.hasTable('sso_configs'))) {
    await knex.schema.createTable('sso_configs', (t) => {
      t.string('id', 36).primary();
      t.string('company_id', 36).notNullable().unique()
        .references('id').inTable('companies').onDelete('CASCADE');
      t.boolean('is_enabled').defaultTo(false);
      t.string('protocol', 10).notNullable(); // 'oidc' or 'saml'
      t.string('display_name', 255).notNullable().defaultTo('SSO Login');

      // OIDC fields
      t.string('oidc_issuer_url', 512).nullable();
      t.string('oidc_client_id', 255).nullable();
      t.text('oidc_client_secret_encrypted').nullable();
      t.string('oidc_scopes', 512).nullable().defaultTo('openid email profile');

      // SAML fields
      t.string('saml_entry_point', 512).nullable();
      t.string('saml_issuer', 512).nullable();
      t.text('saml_cert').nullable();
      t.string('saml_callback_url', 512).nullable();

      // Common
      t.boolean('auto_create_users').defaultTo(true);
      t.string('default_role', 50).defaultTo('user');
      t.text('email_domains').nullable(); // JSON array
      t.string('created_at', 30).notNullable();
      t.string('updated_at', 30).notNullable();
    });
  }

  // Add SSO columns to users table
  if (await knex.schema.hasTable('users')) {
    if (!(await knex.schema.hasColumn('users', 'sso_subject_id'))) {
      await knex.schema.alterTable('users', (t) => {
        t.string('sso_subject_id', 512).nullable();
      });
    }
    if (!(await knex.schema.hasColumn('users', 'sso_provider_id'))) {
      await knex.schema.alterTable('users', (t) => {
        t.string('sso_provider_id', 36).nullable();
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable('users')) {
    if (await knex.schema.hasColumn('users', 'sso_subject_id')) {
      await knex.schema.alterTable('users', (t) => {
        t.dropColumn('sso_subject_id');
      });
    }
    if (await knex.schema.hasColumn('users', 'sso_provider_id')) {
      await knex.schema.alterTable('users', (t) => {
        t.dropColumn('sso_provider_id');
      });
    }
  }
  await knex.schema.dropTableIfExists('sso_configs');
}
