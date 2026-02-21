import { Router, Response } from 'express';
import { authenticate, AuthRequest, requireCompanyAdminOrAbove } from '../middleware/auth.middleware';
import { LdapConfigModel } from '../models/ldap-config.model';
import { LdapService } from '../services/ldap.service';
import { ldapScheduler } from '../services/ldap-scheduler.service';
import { UserRole } from '../types';

const router = Router();

// Helper: verify the requesting user has access to the company
function canAccessCompany(req: AuthRequest, companyId: string): boolean {
  if (!req.user) return false;
  if (req.user.role === UserRole.SUPER_ADMIN) return true;
  if (req.user.role === UserRole.PARK_ADMIN) return true; // park-scoped check could be added
  if (req.user.role === UserRole.COMPANY_ADMIN) return req.user.companyId === companyId;
  return false;
}

// GET /api/ldap/config/:companyId — Get LDAP config for a company
router.get('/config/:companyId', authenticate, requireCompanyAdminOrAbove, async (req: AuthRequest, res: Response) => {
  try {
    const { companyId } = req.params;

    if (!canAccessCompany(req, companyId)) {
      res.status(403).json({ error: 'Cannot access LDAP config for this company' });
      return;
    }

    const config = await LdapConfigModel.findByCompanyId(companyId);
    if (!config) {
      res.status(404).json({ error: 'No LDAP configuration found for this company' });
      return;
    }

    res.json(config);
  } catch (error) {
    console.error('Get LDAP config error:', error);
    res.status(500).json({ error: 'Failed to get LDAP configuration' });
  }
});

// POST /api/ldap/config — Create LDAP config
router.post('/config', authenticate, requireCompanyAdminOrAbove, async (req: AuthRequest, res: Response) => {
  try {
    const { companyId, serverUrl, bindDn, bindPassword, searchBase, ...rest } = req.body;

    if (!companyId || !serverUrl || !bindDn || !bindPassword || !searchBase) {
      res.status(400).json({ error: 'companyId, serverUrl, bindDn, bindPassword, and searchBase are required' });
      return;
    }

    if (!canAccessCompany(req, companyId)) {
      res.status(403).json({ error: 'Cannot configure LDAP for this company' });
      return;
    }

    // Check if config already exists
    const existing = await LdapConfigModel.findByCompanyId(companyId);
    if (existing) {
      res.status(409).json({ error: 'LDAP configuration already exists for this company. Use PUT to update.' });
      return;
    }

    const config = await LdapConfigModel.create({
      companyId,
      serverUrl,
      bindDn,
      bindPassword,
      searchBase,
      ...rest,
    });

    res.status(201).json(config);
  } catch (error) {
    console.error('Create LDAP config error:', error);
    res.status(500).json({ error: 'Failed to create LDAP configuration' });
  }
});

// PUT /api/ldap/config/:id — Update LDAP config
router.put('/config/:id', authenticate, requireCompanyAdminOrAbove, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const existing = await LdapConfigModel.findById(id);
    if (!existing) {
      res.status(404).json({ error: 'LDAP configuration not found' });
      return;
    }

    if (!canAccessCompany(req, existing.companyId)) {
      res.status(403).json({ error: 'Cannot modify LDAP config for this company' });
      return;
    }

    const config = await LdapConfigModel.update(id, req.body);

    // Reschedule if sync interval changed
    if (req.body.syncIntervalHours !== undefined && existing.isEnabled) {
      ldapScheduler.scheduleCompany(existing.companyId, req.body.syncIntervalHours);
    }

    res.json(config);
  } catch (error) {
    console.error('Update LDAP config error:', error);
    res.status(500).json({ error: 'Failed to update LDAP configuration' });
  }
});

// DELETE /api/ldap/config/:id — Delete LDAP config
router.delete('/config/:id', authenticate, requireCompanyAdminOrAbove, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const existing = await LdapConfigModel.findById(id);
    if (!existing) {
      res.status(404).json({ error: 'LDAP configuration not found' });
      return;
    }

    if (!canAccessCompany(req, existing.companyId)) {
      res.status(403).json({ error: 'Cannot delete LDAP config for this company' });
      return;
    }

    ldapScheduler.unscheduleCompany(existing.companyId);
    await LdapConfigModel.delete(id);

    res.status(204).send();
  } catch (error) {
    console.error('Delete LDAP config error:', error);
    res.status(500).json({ error: 'Failed to delete LDAP configuration' });
  }
});

// POST /api/ldap/config/:id/enable — Enable LDAP
router.post('/config/:id/enable', authenticate, requireCompanyAdminOrAbove, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const existing = await LdapConfigModel.findById(id);
    if (!existing) {
      res.status(404).json({ error: 'LDAP configuration not found' });
      return;
    }

    if (!canAccessCompany(req, existing.companyId)) {
      res.status(403).json({ error: 'Cannot modify LDAP config for this company' });
      return;
    }

    const config = await LdapConfigModel.update(id, { isEnabled: true });
    if (existing.syncIntervalHours > 0) {
      ldapScheduler.scheduleCompany(existing.companyId, existing.syncIntervalHours);
    }

    res.json(config);
  } catch (error) {
    console.error('Enable LDAP error:', error);
    res.status(500).json({ error: 'Failed to enable LDAP' });
  }
});

// POST /api/ldap/config/:id/disable — Disable LDAP
router.post('/config/:id/disable', authenticate, requireCompanyAdminOrAbove, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const existing = await LdapConfigModel.findById(id);
    if (!existing) {
      res.status(404).json({ error: 'LDAP configuration not found' });
      return;
    }

    if (!canAccessCompany(req, existing.companyId)) {
      res.status(403).json({ error: 'Cannot modify LDAP config for this company' });
      return;
    }

    const config = await LdapConfigModel.update(id, { isEnabled: false });
    ldapScheduler.unscheduleCompany(existing.companyId);

    res.json(config);
  } catch (error) {
    console.error('Disable LDAP error:', error);
    res.status(500).json({ error: 'Failed to disable LDAP' });
  }
});

// POST /api/ldap/config/:id/test — Test LDAP connection
router.post('/config/:id/test', authenticate, requireCompanyAdminOrAbove, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const existing = await LdapConfigModel.findById(id);
    if (!existing) {
      res.status(404).json({ error: 'LDAP configuration not found' });
      return;
    }

    if (!canAccessCompany(req, existing.companyId)) {
      res.status(403).json({ error: 'Cannot test LDAP config for this company' });
      return;
    }

    const result = await LdapService.testConnection(id);
    res.json(result);
  } catch (error) {
    console.error('Test LDAP connection error:', error);
    res.status(500).json({ error: 'Failed to test LDAP connection' });
  }
});

// POST /api/ldap/config/:id/sync — Trigger manual sync
router.post('/config/:id/sync', authenticate, requireCompanyAdminOrAbove, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const existing = await LdapConfigModel.findById(id);
    if (!existing) {
      res.status(404).json({ error: 'LDAP configuration not found' });
      return;
    }

    if (!existing.isEnabled) {
      res.status(400).json({ error: 'LDAP must be enabled before syncing' });
      return;
    }

    if (!canAccessCompany(req, existing.companyId)) {
      res.status(403).json({ error: 'Cannot sync LDAP for this company' });
      return;
    }

    const result = await LdapService.syncCompanyUsers(existing.companyId);
    res.json(result);
  } catch (error) {
    console.error('LDAP sync error:', error);
    res.status(500).json({ error: 'Failed to sync LDAP users' });
  }
});

// GET /api/ldap/config/:id/sync-status — Get latest sync status
router.get('/config/:id/sync-status', authenticate, requireCompanyAdminOrAbove, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const config = await LdapConfigModel.findById(id);
    if (!config) {
      res.status(404).json({ error: 'LDAP configuration not found' });
      return;
    }

    if (!canAccessCompany(req, config.companyId)) {
      res.status(403).json({ error: 'Cannot view LDAP sync status for this company' });
      return;
    }

    res.json({
      lastSyncAt: config.lastSyncAt,
      lastSyncStatus: config.lastSyncStatus,
      lastSyncMessage: config.lastSyncMessage,
      lastSyncUserCount: config.lastSyncUserCount,
    });
  } catch (error) {
    console.error('Get LDAP sync status error:', error);
    res.status(500).json({ error: 'Failed to get sync status' });
  }
});

export default router;
