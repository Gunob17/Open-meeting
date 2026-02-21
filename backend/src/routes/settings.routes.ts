import { Router, Response } from 'express';
import { SettingsModel } from '../models/settings.model';
import { authenticate, requireAdmin, requireSuperAdmin, AuthRequest } from '../middleware/auth.middleware';
import { Settings } from '../types';

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
    const { openingHour, closingHour } = req.body;

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

    const settings = await SettingsModel.update(openingHour, closingHour);
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
    res.json(settings);
  } catch (error) {
    console.error('Error updating 2FA settings:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: `Failed to update 2FA settings: ${message}` });
  }
});

export default router;
