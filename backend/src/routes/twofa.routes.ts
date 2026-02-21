import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Response, Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import {
  authenticate,
  authenticatePartial,
  AuthRequest,
  generateToken,
} from '../middleware/auth.middleware';
import { SettingsModel } from '../models/settings.model';
import { TrustedDeviceModel } from '../models/trusted-device.model';
import { UserModel } from '../models/user.model';
import { getEffectiveTwoFaEnforcement } from '../utils/twofa-enforcement';

const router = Router();

// Rate limit 2FA verification: 5 attempts per 15 minutes per IP
const twofaVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many verification attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

function sanitizeUser(user: any) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    companyId: user.companyId,
    parkId: user.parkId,
    twofaEnabled: user.twofaEnabled,
  };
}

// POST /setup - Begin 2FA setup: generates secret + QR code
router.post('/setup', authenticatePartial, async (req: AuthRequest, res: Response) => {
  try {
    const user = await UserModel.findById(req.user!.userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (user.twofaEnabled) {
      res.status(400).json({ error: '2FA is already enabled' });
      return;
    }

    const secret = new OTPAuth.Secret({ size: 20 });
    const totp = new OTPAuth.TOTP({
      issuer: 'Open-meeting.com',
      label: user.email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: secret,
    });

    const otpauthUrl = totp.toString();
    const qrCodeUrl = await QRCode.toDataURL(otpauthUrl);

    // Store the secret temporarily (not yet enabled)
    await UserModel.setTwofaSecret(user.id, secret.base32);

    res.json({
      secret: secret.base32,
      qrCodeUrl,
      otpauthUrl,
    });
  } catch (error) {
    console.error('2FA setup error:', error);
    res.status(500).json({ error: 'Failed to set up 2FA' });
  }
});

// POST /setup/confirm - Confirm 2FA setup by verifying a code
router.post('/setup/confirm', authenticatePartial, async (req: AuthRequest, res: Response) => {
  try {
    const { code, keepLoggedIn } = req.body;
    if (!code) {
      res.status(400).json({ error: 'Verification code is required' });
      return;
    }

    const user = await UserModel.findById(req.user!.userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    if (user.twofaEnabled) {
      res.status(400).json({ error: '2FA is already enabled' });
      return;
    }
    if (!user.twofaSecret) {
      res.status(400).json({ error: 'No 2FA setup in progress. Call /setup first.' });
      return;
    }

    const totp = new OTPAuth.TOTP({
      issuer: 'MeetingBooking',
      label: user.email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(user.twofaSecret),
    });

    const delta = totp.validate({ token: code, window: 1 });
    if (delta === null) {
      res.status(400).json({ error: 'Invalid verification code' });
      return;
    }

    // Generate backup codes (10 codes, 8 hex chars each)
    const backupCodes: string[] = [];
    const hashedBackupCodes: string[] = [];
    for (let i = 0; i < 10; i++) {
      const rawCode = crypto.randomBytes(4).toString('hex');
      backupCodes.push(rawCode);
      hashedBackupCodes.push(await bcrypt.hash(rawCode, 10));
    }

    // Enable 2FA
    await UserModel.enableTwoFa(user.id, user.twofaSecret);
    await UserModel.setBackupCodes(user.id, hashedBackupCodes);

    // If this was a forced setup from a partial token, issue a full token
    let token: string | undefined;
    if (req.user!.twofaPending) {
      token = generateToken({
        userId: user.id,
        email: user.email,
        role: user.role,
        companyId: user.companyId,
        parkId: user.parkId,
      }, !!keepLoggedIn);
    }

    res.json({
      message: '2FA enabled successfully',
      backupCodes,
      token,
      user: sanitizeUser({ ...user, twofaEnabled: true }),
    });
  } catch (error) {
    console.error('2FA confirm error:', error);
    res.status(500).json({ error: 'Failed to confirm 2FA setup' });
  }
});

// POST /verify - Verify 2FA code during login (called with partial token)
router.post('/verify', twofaVerifyLimiter, authenticatePartial, async (req: AuthRequest, res: Response) => {
  try {
    const { code, trustDevice, keepLoggedIn } = req.body;
    if (!code) {
      res.status(400).json({ error: 'Verification code is required' });
      return;
    }

    if (!req.user!.twofaPending) {
      res.status(400).json({ error: 'No 2FA verification pending' });
      return;
    }

    const user = await UserModel.findById(req.user!.userId);
    if (!user || !user.twofaSecret) {
      res.status(400).json({ error: '2FA not configured' });
      return;
    }

    // Try TOTP first
    const totp = new OTPAuth.TOTP({
      issuer: 'MeetingBooking',
      label: user.email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(user.twofaSecret),
    });

    let isValid = totp.validate({ token: code, window: 1 }) !== null;

    // If TOTP failed, try backup codes
    if (!isValid && user.twofaBackupCodes) {
      const hashedCodes: string[] = JSON.parse(user.twofaBackupCodes);
      for (let i = 0; i < hashedCodes.length; i++) {
        if (await bcrypt.compare(code, hashedCodes[i])) {
          hashedCodes.splice(i, 1);
          await UserModel.setBackupCodes(user.id, hashedCodes);
          isValid = true;
          break;
        }
      }
    }

    if (!isValid) {
      res.status(401).json({ error: 'Invalid verification code' });
      return;
    }

    // Issue full token
    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
      parkId: user.parkId,
    }, !!keepLoggedIn);

    // Optionally trust the device
    let deviceToken: string | undefined;
    if (trustDevice) {
      const settings = await SettingsModel.getGlobal();
      const rawUserAgent = req.headers['user-agent'] || 'Unknown Device';
      // Sanitize user-agent: strip control chars and limit length
      const userAgent = rawUserAgent.replace(/[\x00-\x1f\x7f<>]/g, '').substring(0, 255);
      const ip = req.ip || req.socket?.remoteAddress || null;

      const trustedDevice = await TrustedDeviceModel.create({
        userId: user.id,
        deviceName: userAgent.substring(0, 255),
        ipAddress: ip,
        expiresInDays: settings.twofaTrustedDeviceDays,
      });
      deviceToken = trustedDevice.deviceToken;
    }

    res.json({
      token,
      user: sanitizeUser(user),
      deviceToken,
    });
  } catch (error) {
    console.error('2FA verify error:', error);
    res.status(500).json({ error: 'Failed to verify 2FA' });
  }
});

// POST /disable - Disable 2FA on account (requires password)
router.post('/disable', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { password } = req.body;
    if (!password) {
      res.status(400).json({ error: 'Password is required to disable 2FA' });
      return;
    }

    const user = await UserModel.findById(req.user!.userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (!user.twofaEnabled) {
      res.status(400).json({ error: '2FA is not enabled' });
      return;
    }

    const isValid = await UserModel.validatePassword(user, password);
    if (!isValid) {
      res.status(401).json({ error: 'Invalid password' });
      return;
    }

    await UserModel.disableTwoFa(user.id);
    await TrustedDeviceModel.deleteAllForUser(user.id);

    res.json({ message: '2FA disabled successfully' });
  } catch (error) {
    console.error('2FA disable error:', error);
    res.status(500).json({ error: 'Failed to disable 2FA' });
  }
});

// GET /status - Get 2FA status for the current user
router.get('/status', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = await UserModel.findById(req.user!.userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const enforcement = await getEffectiveTwoFaEnforcement(user.parkId, user.companyId);
    const settings = await SettingsModel.getGlobal();

    res.json({
      twofaEnabled: user.twofaEnabled,
      enforcement,
      mode: settings.twofaMode,
      trustedDeviceDays: settings.twofaTrustedDeviceDays,
    });
  } catch (error) {
    console.error('2FA status error:', error);
    res.status(500).json({ error: 'Failed to get 2FA status' });
  }
});

// GET /trusted-devices - List trusted devices for the current user
router.get('/trusted-devices', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const devices = await TrustedDeviceModel.findByUser(req.user!.userId);
    const active = devices.filter(d => !TrustedDeviceModel.isExpired(d));
    res.json(active.map(d => ({
      id: d.id,
      deviceName: d.deviceName,
      ipAddress: d.ipAddress,
      expiresAt: d.expiresAt,
      createdAt: d.createdAt,
    })));
  } catch (error) {
    console.error('Get trusted devices error:', error);
    res.status(500).json({ error: 'Failed to get trusted devices' });
  }
});

// DELETE /trusted-devices/:id - Revoke a trusted device
router.delete('/trusted-devices/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const device = await TrustedDeviceModel.findById(req.params.id);
    if (!device || device.userId !== req.user!.userId) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }
    await TrustedDeviceModel.deleteById(req.params.id);
    res.status(204).send();
  } catch (error) {
    console.error('Revoke trusted device error:', error);
    res.status(500).json({ error: 'Failed to revoke device' });
  }
});

export default router;
