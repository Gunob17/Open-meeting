import { Router, Response } from 'express';
import { SettingsModel } from '../models/settings.model';
import { authenticate, requireAdmin, requireSuperAdmin, AuthRequest } from '../middleware/auth.middleware';
import { Settings } from '../types';
import { auditLog, AuditAction, getClientIp } from '../services/audit.service';

const router = Router();

// Get global settings
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const settings = await SettingsModel.getGlobal();
    res.json(settings);
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// Update global settings (admin only)
router.put('/', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { openingHour, closingHour, timezone, timeFormat } = req.body;

    // Validate hours
    if (typeof openingHour !== 'number' || openingHour < 0 || openingHour > 23) {
      return res.status(400).json({ error: 'Opening hour must be between 0 and 23' });
    }
    if (typeof closingHour !== 'number' || closingHour < 0 || closingHour > 23) {
      return res.status(400).json({ error: 'Closing hour must be between 0 and 23' });
    }
    if (openingHour >= closingHour) {
      return res.status(400).json({ error: 'Opening hour must be before closing hour' });
    }
    if (typeof timezone !== 'string' || !timezone.trim()) {
      return res.status(400).json({ error: 'Timezone is required' });
    }
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
    } catch {
      return res.status(400).json({ error: `Invalid timezone: ${timezone}` });
    }
    if (timeFormat !== '12h' && timeFormat !== '24h') {
      return res.status(400).json({ error: 'Time format must be 12h or 24h' });
    }

    const settings = await SettingsModel.update(openingHour, closingHour, timezone.trim(), timeFormat);
    auditLog({ userId: req.user?.userId ?? null, action: AuditAction.SETTINGS_UPDATE, resourceType: 'settings', resourceId: null, ipAddress: getClientIp(req), userAgent: req.headers['user-agent'] as string ?? null, outcome: 'success', metadata: { openingHour, closingHour, timezone: timezone.trim(), timeFormat } });
    res.json(settings);
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Update 2FA settings (super admin only)
router.put('/2fa', authenticate, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { twofaEnforcement, twofaMode, twofaTrustedDeviceDays } = req.body;

    if (!['disabled', 'optional', 'required'].includes(twofaEnforcement)) {
      return res.status(400).json({ error: 'Invalid enforcement value. Must be disabled, optional, or required.' });
    }
    if (!['every_login', 'trusted_device'].includes(twofaMode)) {
      return res.status(400).json({ error: 'Invalid mode value. Must be every_login or trusted_device.' });
    }
    if (typeof twofaTrustedDeviceDays !== 'number' || twofaTrustedDeviceDays < 1 || twofaTrustedDeviceDays > 365) {
      return res.status(400).json({ error: 'Trusted device days must be between 1 and 365' });
    }

    const settings = await SettingsModel.updateTwoFaSettings(
      twofaEnforcement,
      twofaMode,
      twofaTrustedDeviceDays
    );
    auditLog({ userId: req.user?.userId ?? null, action: AuditAction.SETTINGS_2FA_POLICY, resourceType: 'settings', resourceId: null, ipAddress: getClientIp(req), userAgent: req.headers['user-agent'] as string ?? null, outcome: 'success', metadata: { twofaEnforcement, twofaMode, twofaTrustedDeviceDays } });
    res.json(settings);
  } catch (error) {
    console.error('Error updating 2FA settings:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: `Failed to update 2FA settings: ${message}` });
  }
});

// Update system banner settings (super admin only)
router.put('/banner', authenticate, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { bannerEnabled, bannerMessage, bannerLevel, bannerStartsAt, bannerEndsAt } = req.body;

    if (typeof bannerEnabled !== 'boolean') {
      return res.status(400).json({ error: 'bannerEnabled must be a boolean' });
    }
    if (bannerEnabled && (!bannerMessage || typeof bannerMessage !== 'string' || !bannerMessage.trim())) {
      return res.status(400).json({ error: 'A message is required when the banner is enabled' });
    }
    if (!['info', 'warning', 'critical'].includes(bannerLevel)) {
      return res.status(400).json({ error: 'bannerLevel must be info, warning, or critical' });
    }
    if (bannerStartsAt && isNaN(Date.parse(bannerStartsAt))) {
      return res.status(400).json({ error: 'bannerStartsAt must be a valid ISO date string' });
    }
    if (bannerEndsAt && isNaN(Date.parse(bannerEndsAt))) {
      return res.status(400).json({ error: 'bannerEndsAt must be a valid ISO date string' });
    }
    if (bannerStartsAt && bannerEndsAt && new Date(bannerStartsAt) >= new Date(bannerEndsAt)) {
      return res.status(400).json({ error: 'bannerStartsAt must be before bannerEndsAt' });
    }

    const settings = await SettingsModel.updateBannerSettings(
      bannerEnabled,
      bannerEnabled ? bannerMessage.trim() : (bannerMessage ?? null),
      bannerLevel,
      bannerStartsAt || null,
      bannerEndsAt || null,
    );
    auditLog({ userId: req.user?.userId ?? null, action: AuditAction.SETTINGS_BANNER, resourceType: 'settings', resourceId: null, ipAddress: getClientIp(req), userAgent: req.headers['user-agent'] as string ?? null, outcome: 'success', metadata: { bannerEnabled, bannerLevel } });
    res.json(settings);
  } catch (error) {
    console.error('Error updating banner settings:', error);
    res.status(500).json({ error: 'Failed to update banner settings' });
  }
});

export default router;
