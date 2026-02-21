import { Client } from 'ldapts';
import { LdapConfigModel } from '../models/ldap-config.model';
import { UserModel } from '../models/user.model';
import { CompanyModel } from '../models/company.model';
import { LdapConfig, LdapRoleMapping, LdapSyncResult, UserRole } from '../types';

export class LdapService {
  private static createClient(config: LdapConfig, decryptedPassword?: string): Client {
    const tlsOptions: any = {};
    if (config.serverUrl.startsWith('ldaps://') || config.useStarttls) {
      tlsOptions.rejectUnauthorized = config.tlsRejectUnauthorized;
    }

    return new Client({
      url: config.serverUrl,
      timeout: config.connectionTimeoutMs,
      connectTimeout: config.connectionTimeoutMs,
      tlsOptions,
      strictDN: false,
    });
  }

  static async testConnection(configId: string): Promise<{ success: boolean; message: string; userCount?: number }> {
    const config = await LdapConfigModel.findById(configId);
    if (!config) return { success: false, message: 'LDAP configuration not found' };

    const password = await LdapConfigModel.getDecryptedPassword(configId);
    if (!password) return { success: false, message: 'Failed to decrypt bind password' };

    const client = this.createClient(config);

    try {
      if (config.useStarttls) {
        await client.startTLS({
          rejectUnauthorized: config.tlsRejectUnauthorized,
        });
      }

      await client.bind(config.bindDn, password);

      const { searchEntries } = await client.search(config.searchBase, {
        filter: config.userFilter,
        scope: 'sub',
        attributes: [config.emailAttribute],
        sizeLimit: 0,
      });

      await client.unbind();
      return {
        success: true,
        message: `Connection successful. Found ${searchEntries.length} users.`,
        userCount: searchEntries.length,
      };
    } catch (err: any) {
      try { await client.unbind(); } catch {}
      return {
        success: false,
        message: `Connection failed: ${err.message || String(err)}`,
      };
    }
  }

  static async authenticateUser(
    email: string,
    password: string,
    companyId: string
  ): Promise<{ dn: string; email: string; name: string } | null> {
    const config = await LdapConfigModel.findByCompanyId(companyId);
    if (!config || !config.isEnabled) return null;

    const bindPassword = await LdapConfigModel.getDecryptedPassword(config.id);
    if (!bindPassword) return null;

    const client = this.createClient(config);

    try {
      if (config.useStarttls) {
        await client.startTLS({
          rejectUnauthorized: config.tlsRejectUnauthorized,
        });
      }

      // Bind with service account
      await client.bind(config.bindDn, bindPassword);

      // Search for the user by email
      const { searchEntries } = await client.search(config.searchBase, {
        filter: `(&${config.userFilter}(${config.emailAttribute}=${this.escapeLdapFilter(email)}))`,
        scope: 'sub',
        attributes: [config.emailAttribute, config.nameAttribute, 'dn'],
        sizeLimit: 1,
      });

      if (searchEntries.length === 0) {
        await client.unbind();
        return null;
      }

      const userEntry = searchEntries[0];
      const userDn = userEntry.dn;

      await client.unbind();

      // Now try to bind as the user to verify their password
      const userClient = this.createClient(config);
      try {
        if (config.useStarttls) {
          await userClient.startTLS({
            rejectUnauthorized: config.tlsRejectUnauthorized,
          });
        }
        await userClient.bind(userDn, password);
        await userClient.unbind();

        return {
          dn: userDn,
          email: this.getAttributeValue(userEntry, config.emailAttribute) || email,
          name: this.getAttributeValue(userEntry, config.nameAttribute) || '',
        };
      } catch {
        try { await userClient.unbind(); } catch {}
        return null; // Invalid credentials
      }
    } catch (err: any) {
      try { await client.unbind(); } catch {}
      console.error(`LDAP auth error for company ${companyId}:`, err.message);
      return null;
    }
  }

  static async syncCompanyUsers(companyId: string): Promise<LdapSyncResult> {
    const result: LdapSyncResult = {
      created: 0,
      updated: 0,
      disabled: 0,
      reactivated: 0,
      errors: [],
      totalLdapUsers: 0,
    };

    const config = await LdapConfigModel.findByCompanyId(companyId);
    if (!config || !config.isEnabled) {
      result.errors.push('LDAP not configured or not enabled for this company');
      return result;
    }

    await LdapConfigModel.updateSyncStatus(config.id, 'in_progress', 'Sync started...');

    const bindPassword = await LdapConfigModel.getDecryptedPassword(config.id);
    if (!bindPassword) {
      const msg = 'Failed to decrypt bind password';
      result.errors.push(msg);
      await LdapConfigModel.updateSyncStatus(config.id, 'error', msg);
      return result;
    }

    const company = await CompanyModel.findById(companyId);
    if (!company) {
      const msg = 'Company not found';
      result.errors.push(msg);
      await LdapConfigModel.updateSyncStatus(config.id, 'error', msg);
      return result;
    }

    const syncStartTime = new Date().toISOString();
    const client = this.createClient(config);

    try {
      if (config.useStarttls) {
        await client.startTLS({
          rejectUnauthorized: config.tlsRejectUnauthorized,
        });
      }

      await client.bind(config.bindDn, bindPassword);

      // Search all users
      const { searchEntries: ldapUsers } = await client.search(config.searchBase, {
        filter: config.userFilter,
        scope: 'sub',
        attributes: [config.emailAttribute, config.nameAttribute, 'dn'],
        sizeLimit: 0,
      });

      result.totalLdapUsers = ldapUsers.length;

      // Build group memberships if configured
      const userGroupMap = new Map<string, string[]>();
      if (config.groupSearchBase && config.groupFilter) {
        try {
          const { searchEntries: groups } = await client.search(config.groupSearchBase, {
            filter: config.groupFilter,
            scope: 'sub',
            attributes: ['dn', config.groupMemberAttribute],
            sizeLimit: 0,
          });

          for (const group of groups) {
            const groupDn = group.dn;
            const members = this.getAttributeValues(group, config.groupMemberAttribute);
            for (const memberDn of members) {
              const normalizedMemberDn = memberDn.toLowerCase();
              if (!userGroupMap.has(normalizedMemberDn)) {
                userGroupMap.set(normalizedMemberDn, []);
              }
              userGroupMap.get(normalizedMemberDn)!.push(groupDn);
            }
          }
        } catch (err: any) {
          result.errors.push(`Group search failed: ${err.message}`);
        }
      }

      // Process each LDAP user
      const seenLdapDns = new Set<string>();

      for (const ldapUser of ldapUsers) {
        try {
          const ldapDn = ldapUser.dn;
          const email = this.getAttributeValue(ldapUser, config.emailAttribute);
          const name = this.getAttributeValue(ldapUser, config.nameAttribute) || '';

          if (!email) {
            result.errors.push(`Skipping user ${ldapDn}: no email attribute`);
            continue;
          }

          seenLdapDns.add(ldapDn);

          // Resolve role from groups
          const userGroups = userGroupMap.get(ldapDn.toLowerCase()) || [];
          const role = this.resolveRole(userGroups, config.roleMappings, config.defaultRole);

          // Try to find existing user by LDAP DN first, then by email
          let existingUser = await UserModel.findByLdapDn(ldapDn, companyId);
          if (!existingUser) {
            existingUser = await UserModel.findByEmail(email);
            // Only match by email if the user belongs to the same company
            if (existingUser && existingUser.companyId !== companyId) {
              result.errors.push(`Skipping ${email}: email exists in another company`);
              continue;
            }
          }

          if (existingUser) {
            // Update existing user
            const updates: any = { ldapDn };
            if (existingUser.email !== email) updates.email = email;
            if (existingUser.name !== name) updates.name = name;
            // Only update role if it changed and is within allowed roles
            if (existingUser.role !== role && (role === UserRole.USER || role === UserRole.COMPANY_ADMIN)) {
              updates.role = role;
            }

            await UserModel.updateLdapUser(existingUser.id, updates);

            // Re-activate if previously disabled
            if (!existingUser.isActive) {
              await UserModel.setActive(existingUser.id, true);
              result.reactivated++;
            }

            // If user was local, convert to LDAP
            if (existingUser.authSource === 'local') {
              const { getDb } = await import('../models/database');
              const db = getDb();
              await db('users').where('id', existingUser.id).update({ auth_source: 'ldap' });
            }

            result.updated++;
          } else {
            // Create new user from LDAP
            await UserModel.createFromLdap({
              email,
              name,
              role,
              companyId,
              parkId: company.parkId,
              ldapDn,
            });
            result.created++;
          }
        } catch (err: any) {
          result.errors.push(`Error processing user ${ldapUser.dn}: ${err.message}`);
        }
      }

      // Disable users no longer in LDAP
      const ldapUsersInDb = await UserModel.findLdapUsersByCompany(companyId);
      for (const dbUser of ldapUsersInDb) {
        if (dbUser.ldapDn && !seenLdapDns.has(dbUser.ldapDn) && dbUser.isActive) {
          await UserModel.setActive(dbUser.id, false);
          result.disabled++;
        }
      }

      await client.unbind();

      const summary = `Sync completed: ${result.created} created, ${result.updated} updated, ${result.disabled} disabled, ${result.reactivated} reactivated` +
        (result.errors.length > 0 ? ` (${result.errors.length} errors)` : '');
      await LdapConfigModel.updateSyncStatus(config.id, 'success', summary, result.totalLdapUsers);

      return result;
    } catch (err: any) {
      try { await client.unbind(); } catch {}
      const msg = `Sync failed: ${err.message || String(err)}`;
      result.errors.push(msg);
      await LdapConfigModel.updateSyncStatus(config.id, 'error', msg);
      return result;
    }
  }

  private static resolveRole(groups: string[], roleMappings: LdapRoleMapping[], defaultRole: string): string {
    // Priority order: company_admin > user
    const rolePriority: Record<string, number> = {
      'company_admin': 2,
      'user': 1,
    };

    let bestRole = defaultRole;
    let bestPriority = rolePriority[defaultRole] || 0;

    for (const mapping of roleMappings) {
      // Only allow mapping to company_admin or user (not park_admin or super_admin)
      if (mapping.appRole !== UserRole.USER && mapping.appRole !== UserRole.COMPANY_ADMIN) {
        continue;
      }

      const normalizedGroupDn = mapping.ldapGroupDn.toLowerCase();
      if (groups.some(g => g.toLowerCase() === normalizedGroupDn)) {
        const priority = rolePriority[mapping.appRole] || 0;
        if (priority > bestPriority) {
          bestRole = mapping.appRole;
          bestPriority = priority;
        }
      }
    }

    return bestRole;
  }

  private static getAttributeValue(entry: any, attribute: string): string | null {
    const val = entry[attribute];
    if (!val) return null;
    if (Array.isArray(val)) return val[0]?.toString() || null;
    if (Buffer.isBuffer(val)) return val.toString();
    return String(val);
  }

  private static getAttributeValues(entry: any, attribute: string): string[] {
    const val = entry[attribute];
    if (!val) return [];
    if (Array.isArray(val)) return val.map(v => (Buffer.isBuffer(v) ? v.toString() : String(v)));
    if (Buffer.isBuffer(val)) return [val.toString()];
    return [String(val)];
  }

  private static escapeLdapFilter(value: string): string {
    return value
      .replace(/\\/g, '\\5c')
      .replace(/\*/g, '\\2a')
      .replace(/\(/g, '\\28')
      .replace(/\)/g, '\\29')
      .replace(/\0/g, '\\00');
  }
}
