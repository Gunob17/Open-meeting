import { v4 as uuidv4 } from 'uuid';
import { getDb } from './database';
import { encrypt, decrypt } from '../utils/encryption';
import { SsoConfig, CreateSsoConfigRequest, SsoProtocol } from '../types';

export class SsoConfigModel {
  static async create(data: CreateSsoConfigRequest): Promise<SsoConfig> {
    const db = getDb();
    const id = uuidv4();
    const now = new Date().toISOString();

    await db('sso_configs').insert({
      id,
      company_id: data.companyId,
      is_enabled: false,
      protocol: data.protocol,
      display_name: data.displayName || 'SSO Login',
      oidc_issuer_url: data.oidcIssuerUrl || null,
      oidc_client_id: data.oidcClientId || null,
      oidc_client_secret_encrypted: data.oidcClientSecret ? encrypt(data.oidcClientSecret) : null,
      oidc_scopes: data.oidcScopes || 'openid email profile',
      saml_entry_point: data.samlEntryPoint || null,
      saml_issuer: data.samlIssuer || null,
      saml_cert: data.samlCert || null,
      saml_callback_url: data.samlCallbackUrl || null,
      auto_create_users: data.autoCreateUsers !== false,
      default_role: data.defaultRole || 'user',
      email_domains: JSON.stringify(data.emailDomains || []),
      created_at: now,
      updated_at: now,
    });

    return (await this.findById(id))!;
  }

  static async findById(id: string): Promise<SsoConfig | null> {
    const db = getDb();
    const row = await db('sso_configs').where('id', id).first();
    if (!row) return null;
    return this.mapRowToConfig(row);
  }

  static async findByCompanyId(companyId: string): Promise<SsoConfig | null> {
    const db = getDb();
    const row = await db('sso_configs').where('company_id', companyId).first();
    if (!row) return null;
    return this.mapRowToConfig(row);
  }

  static async findAllEnabled(): Promise<SsoConfig[]> {
    const db = getDb();
    const rows = await db('sso_configs').where('is_enabled', true);
    return rows.map(this.mapRowToConfig);
  }

  static async findByEmailDomain(domain: string): Promise<SsoConfig | null> {
    const db = getDb();
    const rows = await db('sso_configs').where('is_enabled', true);
    for (const row of rows) {
      const domains: string[] = JSON.parse(row.email_domains || '[]');
      if (domains.length === 0 || domains.includes(domain.toLowerCase())) {
        return this.mapRowToConfig(row);
      }
    }
    return null;
  }

  static async update(id: string, data: Partial<CreateSsoConfigRequest> & { isEnabled?: boolean }): Promise<SsoConfig | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const db = getDb();
    const now = new Date().toISOString();
    const updateData: any = { updated_at: now };

    if (data.protocol !== undefined) updateData.protocol = data.protocol;
    if (data.displayName !== undefined) updateData.display_name = data.displayName;
    if (data.oidcIssuerUrl !== undefined) updateData.oidc_issuer_url = data.oidcIssuerUrl;
    if (data.oidcClientId !== undefined) updateData.oidc_client_id = data.oidcClientId;
    if (data.oidcClientSecret !== undefined) updateData.oidc_client_secret_encrypted = data.oidcClientSecret ? encrypt(data.oidcClientSecret) : null;
    if (data.oidcScopes !== undefined) updateData.oidc_scopes = data.oidcScopes;
    if (data.samlEntryPoint !== undefined) updateData.saml_entry_point = data.samlEntryPoint;
    if (data.samlIssuer !== undefined) updateData.saml_issuer = data.samlIssuer;
    if (data.samlCert !== undefined) updateData.saml_cert = data.samlCert;
    if (data.samlCallbackUrl !== undefined) updateData.saml_callback_url = data.samlCallbackUrl;
    if (data.autoCreateUsers !== undefined) updateData.auto_create_users = data.autoCreateUsers;
    if (data.defaultRole !== undefined) updateData.default_role = data.defaultRole;
    if (data.emailDomains !== undefined) updateData.email_domains = JSON.stringify(data.emailDomains);
    if (data.isEnabled !== undefined) updateData.is_enabled = data.isEnabled;

    await db('sso_configs').where('id', id).update(updateData);
    return this.findById(id);
  }

  static async delete(id: string): Promise<boolean> {
    const db = getDb();
    const count = await db('sso_configs').where('id', id).del();
    return count > 0;
  }

  static async getDecryptedClientSecret(id: string): Promise<string | null> {
    const db = getDb();
    const row = await db('sso_configs').where('id', id).first();
    if (!row || !row.oidc_client_secret_encrypted) return null;
    return decrypt(row.oidc_client_secret_encrypted);
  }

  private static mapRowToConfig(row: any): SsoConfig {
    return {
      id: row.id,
      companyId: row.company_id,
      isEnabled: !!row.is_enabled,
      protocol: row.protocol as SsoProtocol,
      displayName: row.display_name,
      oidcIssuerUrl: row.oidc_issuer_url || null,
      oidcClientId: row.oidc_client_id || null,
      // Client secret is never exposed through normal reads
      oidcScopes: row.oidc_scopes || null,
      samlEntryPoint: row.saml_entry_point || null,
      samlIssuer: row.saml_issuer || null,
      samlCert: row.saml_cert || null,
      samlCallbackUrl: row.saml_callback_url || null,
      autoCreateUsers: !!row.auto_create_users,
      defaultRole: row.default_role,
      emailDomains: JSON.parse(row.email_domains || '[]'),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
