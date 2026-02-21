import { LdapConfigModel } from '../models/ldap-config.model';
import { LdapService } from './ldap.service';

class LdapScheduler {
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private refreshInterval: NodeJS.Timeout | null = null;
  private syncing: Set<string> = new Set();

  async start(): Promise<void> {
    try {
      const configs = await LdapConfigModel.findAllEnabled();
      for (const config of configs) {
        if (config.syncIntervalHours > 0) {
          this.scheduleCompany(config.companyId, config.syncIntervalHours);
        }
      }
      // Refresh schedules every 5 minutes to pick up config changes
      this.refreshInterval = setInterval(() => this.refreshSchedules(), 5 * 60 * 1000);
      console.log(`LDAP scheduler started with ${configs.length} active configs`);
    } catch (err: any) {
      console.error('Failed to start LDAP scheduler:', err.message);
    }
  }

  scheduleCompany(companyId: string, intervalHours: number): void {
    this.unscheduleCompany(companyId);
    if (intervalHours <= 0) return;

    const ms = intervalHours * 60 * 60 * 1000;
    const timer = setInterval(async () => {
      if (this.syncing.has(companyId)) return; // Prevent concurrent syncs
      this.syncing.add(companyId);
      try {
        await LdapService.syncCompanyUsers(companyId);
      } catch (err: any) {
        console.error(`LDAP scheduled sync failed for company ${companyId}:`, err.message);
      } finally {
        this.syncing.delete(companyId);
      }
    }, ms);

    this.intervals.set(companyId, timer);
  }

  unscheduleCompany(companyId: string): void {
    const existing = this.intervals.get(companyId);
    if (existing) {
      clearInterval(existing);
      this.intervals.delete(companyId);
    }
  }

  private async refreshSchedules(): Promise<void> {
    try {
      const configs = await LdapConfigModel.findAllEnabled();
      const enabledCompanyIds = new Set(configs.map(c => c.companyId));

      // Remove schedules for configs that are no longer enabled
      for (const [companyId] of this.intervals) {
        if (!enabledCompanyIds.has(companyId)) {
          this.unscheduleCompany(companyId);
        }
      }

      // Add/update schedules for enabled configs
      for (const config of configs) {
        if (config.syncIntervalHours > 0 && !this.intervals.has(config.companyId)) {
          this.scheduleCompany(config.companyId, config.syncIntervalHours);
        }
      }
    } catch (err: any) {
      console.error('Failed to refresh LDAP schedules:', err.message);
    }
  }

  stop(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
    for (const timer of this.intervals.values()) {
      clearInterval(timer);
    }
    this.intervals.clear();
  }
}

export const ldapScheduler = new LdapScheduler();
