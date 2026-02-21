import { v4 as uuidv4 } from 'uuid';
import { getDb } from './database';
import { encrypt, decrypt } from '../utils/encryption';
import { LdapConfig, CreateLdapConfigRequest, LdapRoleMapping } from '../types';

export class LdapConfigModel {
  static async create(data: CreateLdapConfigRequest): Promise<LdapConfig> {
    const db = getDb();
    const id = uuidv4();
    const now = new Date().toISOString();

    await db('ldap_configs').insert({
      id,
      company_id: data.companyId,
      is_enabled: false,
      server_url: data.serverUrl,
      bind_dn: data.bindDn,
      bind_password_encrypted: encrypt(data.bindPassword),
      search_base: data.searchBase,
      user_filter: data.userFilter || '(objectClass=inetOrgPerson)',
      username_attribute: data.usernameAttribute || 'uid',
      email_attribute: data.emailAttribute || 'mail',
      name_attribute: data.nameAttribute || 'cn',
      group_search_base: data.groupSearchBase || null,
      group_filter: data.groupFilter || null,
      group_member_attribute: data.groupMemberAttribute || 'member',
      role_mappings: JSON.stringify(data.roleMappings || []),
      default_role: data.defaultRole || 'user',
      sync_interval_hours: data.syncIntervalHours ?? 24,
      use_starttls: data.useStarttls ?? false,
      tls_reject_unauthorized: data.tlsRejectUnauthorized ?? true,
      connection_timeout_ms: data.connectionTimeoutMs ?? 10000,
      created_at: now,
      updated_at: now,
    });

    return (await this.findById(id))!;
  }

  static async findById(id: string): Promise<LdapConfig | null> {
    const db = getDb();
    const row = await db('ldap_configs').where('id', id).first();
    if (!row) return null;
    return this.mapRowToConfig(row);
  }

  static async findByCompanyId(companyId: string): Promise<LdapConfig | null> {
    const db = getDb();
    const row = await db('ldap_configs').where('company_id', companyId).first();
    if (!row) return null;
    return this.mapRowToConfig(row);
  }

  static async findAllEnabled(): Promise<LdapConfig[]> {
    const db = getDb();
    const rows = await db('ldap_configs').where('is_enabled', true);
    return rows.map(this.mapRowToConfig);
  }

  static async update(id: string, data: Partial<CreateLdapConfigRequest> & { isEnabled?: boolean }): Promise<LdapConfig | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const db = getDb();
    const now = new Date().toISOString();

    const updateData: any = { updated_at: now };

    if (data.serverUrl !== undefined) updateData.server_url = data.serverUrl;
    if (data.bindDn !== undefined) updateData.bind_dn = data.bindDn;
    if (data.bindPassword !== undefined) updateData.bind_password_encrypted = encrypt(data.bindPassword);
    if (data.searchBase !== undefined) updateData.search_base = data.searchBase;
    if (data.userFilter !== undefined) updateData.user_filter = data.userFilter;
    if (data.usernameAttribute !== undefined) updateData.username_attribute = data.usernameAttribute;
    if (data.emailAttribute !== undefined) updateData.email_attribute = data.emailAttribute;
    if (data.nameAttribute !== undefined) updateData.name_attribute = data.nameAttribute;
    if (data.groupSearchBase !== undefined) updateData.group_search_base = data.groupSearchBase;
    if (data.groupFilter !== undefined) updateData.group_filter = data.groupFilter;
    if (data.groupMemberAttribute !== undefined) updateData.group_member_attribute = data.groupMemberAttribute;
    if (data.roleMappings !== undefined) updateData.role_mappings = JSON.stringify(data.roleMappings);
    if (data.defaultRole !== undefined) updateData.default_role = data.defaultRole;
    if (data.syncIntervalHours !== undefined) updateData.sync_interval_hours = data.syncIntervalHours;
    if (data.useStarttls !== undefined) updateData.use_starttls = data.useStarttls;
    if (data.tlsRejectUnauthorized !== undefined) updateData.tls_reject_unauthorized = data.tlsRejectUnauthorized;
    if (data.connectionTimeoutMs !== undefined) updateData.connection_timeout_ms = data.connectionTimeoutMs;
    if (data.isEnabled !== undefined) updateData.is_enabled = data.isEnabled;

    await db('ldap_configs').where('id', id).update(updateData);
    return this.findById(id);
  }

  static async delete(id: string): Promise<boolean> {
    const db = getDb();
    const count = await db('ldap_configs').where('id', id).del();
    return count > 0;
  }

  static async getDecryptedPassword(id: string): Promise<string | null> {
    const db = getDb();
    const row = await db('ldap_configs').where('id', id).first();
    if (!row) return null;
    return decrypt(row.bind_password_encrypted);
  }

  static async updateSyncStatus(id: string, status: string, message: string, userCount?: number): Promise<void> {
    const db = getDb();
    const now = new Date().toISOString();
    const updateData: any = {
      last_sync_status: status,
      last_sync_message: message,
      updated_at: now,
    };
    if (status === 'success' || status === 'error') {
      updateData.last_sync_at = now;
    }
    if (userCount !== undefined) {
      updateData.last_sync_user_count = userCount;
    }
    await db('ldap_configs').where('id', id).update(updateData);
  }

  private static mapRowToConfig(row: any): LdapConfig {
    return {
      id: row.id,
      companyId: row.company_id,
      isEnabled: !!row.is_enabled,
      serverUrl: row.server_url,
      bindDn: row.bind_dn,
      // Password is never exposed through normal reads
      searchBase: row.search_base,
      userFilter: row.user_filter,
      usernameAttribute: row.username_attribute,
      emailAttribute: row.email_attribute,
      nameAttribute: row.name_attribute,
      groupSearchBase: row.group_search_base || null,
      groupFilter: row.group_filter || null,
      groupMemberAttribute: row.group_member_attribute,
      roleMappings: JSON.parse(row.role_mappings || '[]') as LdapRoleMapping[],
      defaultRole: row.default_role,
      syncIntervalHours: row.sync_interval_hours,
      lastSyncAt: row.last_sync_at || null,
      lastSyncStatus: row.last_sync_status || null,
      lastSyncMessage: row.last_sync_message || null,
      lastSyncUserCount: row.last_sync_user_count ?? null,
      useStarttls: !!row.use_starttls,
      tlsRejectUnauthorized: row.tls_reject_unauthorized !== false && row.tls_reject_unauthorized !== 0,
      connectionTimeoutMs: row.connection_timeout_ms,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
