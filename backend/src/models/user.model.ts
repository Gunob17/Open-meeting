import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { getDb } from './database';
import { User, UserRole, CreateUserRequest } from '../types';

export class UserModel {
  static async create(data: CreateUserRequest): Promise<User> {
    const db = getDb();
    const id = uuidv4();
    const now = new Date().toISOString();
    const hashedPassword = await bcrypt.hash(data.password, 10);

    await db('users').insert({
      id,
      email: data.email,
      password: hashedPassword,
      name: data.name,
      role: data.role,
      company_id: data.companyId,
      park_id: data.parkId || null,
      addon_roles: JSON.stringify(data.addonRoles || []),
      created_at: now,
      updated_at: now,
    });

    return (await this.findById(id))!;
  }

  static async findById(id: string): Promise<User | null> {
    const db = getDb();
    const row = await db('users').where('id', id).first();
    if (!row) return null;
    return this.mapRowToUser(row);
  }

  static async findByEmail(email: string): Promise<User | null> {
    const db = getDb();
    const row = await db('users').where('email', email).first();
    if (!row) return null;
    return this.mapRowToUser(row);
  }

  static async findByCompany(companyId: string): Promise<User[]> {
    const db = getDb();
    const rows = await db('users').where('company_id', companyId).orderBy('name');
    return rows.map(this.mapRowToUser);
  }

  static async findAll(parkId?: string | null): Promise<User[]> {
    const db = getDb();
    let query = db('users').whereNot('company_id', 'system');

    if (parkId) {
      query = query.andWhere('park_id', parkId);
    }

    const rows = await query.orderBy('name');
    return rows.map(this.mapRowToUser);
  }

  static async findByPark(parkId: string): Promise<User[]> {
    const db = getDb();
    const rows = await db('users')
      .where('park_id', parkId)
      .whereNot('company_id', 'system')
      .orderBy('name');
    return rows.map(this.mapRowToUser);
  }

  static async update(id: string, data: Partial<CreateUserRequest>): Promise<User | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const db = getDb();
    const now = new Date().toISOString();
    let hashedPassword = existing.password;

    if (data.password) {
      hashedPassword = await bcrypt.hash(data.password, 10);
    }

    await db('users').where('id', id).update({
      email: data.email ?? existing.email,
      password: hashedPassword,
      name: data.name ?? existing.name,
      role: data.role ?? existing.role,
      company_id: data.companyId ?? existing.companyId,
      park_id: data.parkId !== undefined ? data.parkId : existing.parkId,
      addon_roles: data.addonRoles !== undefined ? JSON.stringify(data.addonRoles) : JSON.stringify(existing.addonRoles),
      updated_at: now,
    });

    return this.findById(id);
  }

  static async delete(id: string): Promise<boolean> {
    const db = getDb();
    const count = await db('users').where('id', id).del();
    return count > 0;
  }

  static async validatePassword(user: User, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.password);
  }

  static async findByLdapDn(ldapDn: string, companyId: string): Promise<User | null> {
    const db = getDb();
    const row = await db('users')
      .where('ldap_dn', ldapDn)
      .andWhere('company_id', companyId)
      .first();
    if (!row) return null;
    return this.mapRowToUser(row);
  }

  static async setActive(userId: string, isActive: boolean): Promise<void> {
    const db = getDb();
    await db('users').where('id', userId).update({
      is_active: isActive,
      updated_at: new Date().toISOString(),
    });
  }

  static async createFromLdap(data: {
    email: string;
    name: string;
    role: string;
    companyId: string;
    parkId: string | null;
    ldapDn: string;
  }): Promise<User> {
    const db = getDb();
    const id = uuidv4();
    const now = new Date().toISOString();
    const unusablePassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);

    await db('users').insert({
      id,
      email: data.email,
      password: unusablePassword,
      name: data.name,
      role: data.role,
      company_id: data.companyId,
      park_id: data.parkId,
      addon_roles: '[]',
      auth_source: 'ldap',
      ldap_dn: data.ldapDn,
      is_active: true,
      ldap_synced_at: now,
      created_at: now,
      updated_at: now,
    });

    return (await this.findById(id))!;
  }

  static async updateLdapUser(userId: string, data: {
    email?: string;
    name?: string;
    role?: string;
    ldapDn?: string;
  }): Promise<void> {
    const db = getDb();
    const now = new Date().toISOString();
    const updateData: any = { ldap_synced_at: now, updated_at: now };
    if (data.email !== undefined) updateData.email = data.email;
    if (data.name !== undefined) updateData.name = data.name;
    if (data.role !== undefined) updateData.role = data.role;
    if (data.ldapDn !== undefined) updateData.ldap_dn = data.ldapDn;
    await db('users').where('id', userId).update(updateData);
  }

  static async findLdapUsersByCompany(companyId: string): Promise<User[]> {
    const db = getDb();
    const rows = await db('users')
      .where('company_id', companyId)
      .andWhere('auth_source', 'ldap')
      .orderBy('name');
    return rows.map(this.mapRowToUser);
  }

  static async findBySsoSubject(subjectId: string, providerId: string): Promise<User | null> {
    const db = getDb();
    const row = await db('users')
      .where('sso_subject_id', subjectId)
      .andWhere('sso_provider_id', providerId)
      .first();
    if (!row) return null;
    return this.mapRowToUser(row);
  }

  static async createFromSso(data: {
    email: string;
    name: string;
    role: string;
    companyId: string;
    parkId: string | null;
    authSource: 'oidc' | 'saml';
    ssoSubjectId: string;
    ssoProviderId: string;
  }): Promise<User> {
    const db = getDb();
    const id = uuidv4();
    const now = new Date().toISOString();
    const unusablePassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);

    await db('users').insert({
      id,
      email: data.email,
      password: unusablePassword,
      name: data.name,
      role: data.role,
      company_id: data.companyId,
      park_id: data.parkId,
      addon_roles: '[]',
      auth_source: data.authSource,
      sso_subject_id: data.ssoSubjectId,
      sso_provider_id: data.ssoProviderId,
      is_active: true,
      created_at: now,
      updated_at: now,
    });

    return (await this.findById(id))!;
  }

  static async linkSsoIdentity(userId: string, subjectId: string, providerId: string, authSource: 'oidc' | 'saml'): Promise<void> {
    const db = getDb();
    await db('users').where('id', userId).update({
      sso_subject_id: subjectId,
      sso_provider_id: providerId,
      auth_source: authSource,
      updated_at: new Date().toISOString(),
    });
  }

  static async enableTwoFa(userId: string, secret: string): Promise<void> {
    const db = getDb();
    await db('users').where('id', userId).update({
      twofa_secret: secret,
      twofa_enabled: true,
      updated_at: new Date().toISOString(),
    });
  }

  static async disableTwoFa(userId: string): Promise<void> {
    const db = getDb();
    await db('users').where('id', userId).update({
      twofa_secret: null,
      twofa_enabled: false,
      twofa_backup_codes: null,
      updated_at: new Date().toISOString(),
    });
  }

  static async setTwofaSecret(userId: string, secret: string): Promise<void> {
    const db = getDb();
    await db('users').where('id', userId).update({
      twofa_secret: secret,
      updated_at: new Date().toISOString(),
    });
  }

  static async setBackupCodes(userId: string, codes: string[]): Promise<void> {
    const db = getDb();
    await db('users').where('id', userId).update({
      twofa_backup_codes: JSON.stringify(codes),
      updated_at: new Date().toISOString(),
    });
  }

  private static mapRowToUser(row: any): User {
    return {
      id: row.id,
      email: row.email,
      password: row.password,
      name: row.name,
      role: row.role as UserRole,
      companyId: row.company_id,
      parkId: row.park_id,
      twofaEnabled: !!row.twofa_enabled,
      twofaSecret: row.twofa_secret || null,
      twofaBackupCodes: row.twofa_backup_codes || null,
      addonRoles: JSON.parse(row.addon_roles || '[]'),
      isActive: row.is_active !== undefined ? !!row.is_active : true,
      authSource: row.auth_source || 'local',
      ldapDn: row.ldap_dn || null,
      ldapSyncedAt: row.ldap_synced_at || null,
      ssoSubjectId: row.sso_subject_id || null,
      ssoProviderId: row.sso_provider_id || null,
      inviteToken: row.invite_token || null,
      inviteTokenExpiry: row.invite_token_expiry || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  static async findByInviteToken(token: string): Promise<User | null> {
    const db = getDb();
    const row = await db('users').where('invite_token', token).first();
    if (!row) return null;
    return this.mapRowToUser(row);
  }

  static async createInvited(data: {
    email: string;
    role: UserRole;
    companyId: string;
    parkId?: string | null;
    addonRoles?: string[];
    inviteToken: string;
    inviteTokenExpiry: string;
  }): Promise<User> {
    const db = getDb();
    const id = uuidv4();
    const now = new Date().toISOString();
    const unusablePassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);

    await db('users').insert({
      id,
      email: data.email,
      password: unusablePassword,
      name: '',
      role: data.role,
      company_id: data.companyId,
      park_id: data.parkId || null,
      addon_roles: JSON.stringify(data.addonRoles || []),
      is_active: false,
      auth_source: 'local',
      invite_token: data.inviteToken,
      invite_token_expiry: data.inviteTokenExpiry,
      created_at: now,
      updated_at: now,
    });

    return (await this.findById(id))!;
  }

  static async completeInvite(userId: string, name: string, password: string): Promise<void> {
    const db = getDb();
    const hashedPassword = await bcrypt.hash(password, 10);
    await db('users').where('id', userId).update({
      name,
      password: hashedPassword,
      is_active: true,
      invite_token: null,
      invite_token_expiry: null,
      updated_at: new Date().toISOString(),
    });
  }
}
