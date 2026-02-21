import { Router, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { UserModel } from '../models/user.model';
import { SettingsModel } from '../models/settings.model';
import { TrustedDeviceModel } from '../models/trusted-device.model';
import { LdapConfigModel } from '../models/ldap-config.model';
import { LdapService } from '../services/ldap.service';
import { generateToken, generatePartialToken, authenticate, AuthRequest } from '../middleware/auth.middleware';
import { getEffectiveTwoFaEnforcement } from '../utils/twofa-enforcement';

const router = Router();

// Rate limit login attempts: 10 attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts, please try again later' },
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
    addonRoles: user.addonRoles || [],
  };
}

// Login
router.post('/login', loginLimiter, async (req, res: Response) => {
  try {
    const { email, password, deviceToken, keepLoggedIn } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const user = await UserModel.findByEmail(email);
    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    // Check if user is active (soft-disabled by LDAP sync)
    if (!user.isActive) {
      res.status(401).json({ error: 'Account is disabled' });
      return;
    }

    // LDAP or local authentication
    if (user.authSource === 'ldap') {
      const ldapConfig = await LdapConfigModel.findByCompanyId(user.companyId);
      if (ldapConfig && ldapConfig.isEnabled) {
        const ldapResult = await LdapService.authenticateUser(email, password, user.companyId);
        if (!ldapResult) {
          res.status(401).json({ error: 'Invalid credentials' });
          return;
        }
      } else {
        res.status(401).json({ error: 'LDAP authentication unavailable. Contact your administrator.' });
        return;
      }
    } else {
      const isValid = await UserModel.validatePassword(user, password);
      if (!isValid) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }
    }

    // Determine 2FA requirements
    const settings = await SettingsModel.getGlobal();
    const enforcement = await getEffectiveTwoFaEnforcement(user.parkId, user.companyId);
    const userHas2FA = user.twofaEnabled;

    // Case 1: User has 2FA enabled
    if (userHas2FA) {
      // Check trusted device mode
      if (settings.twofaMode === 'trusted_device' && deviceToken) {
        const trustedDevice = await TrustedDeviceModel.findByToken(deviceToken);
        if (trustedDevice && trustedDevice.userId === user.id && !TrustedDeviceModel.isExpired(trustedDevice)) {
          // Trusted device — skip 2FA
          const token = generateToken({
            userId: user.id,
            email: user.email,
            role: user.role,
            companyId: user.companyId,
            parkId: user.parkId,
          }, !!keepLoggedIn);
          res.json({ token, user: sanitizeUser(user) });
          return;
        }
      }

      // 2FA required — issue partial token
      const partialToken = generatePartialToken({
        userId: user.id,
        email: user.email,
        role: user.role,
        companyId: user.companyId,
        parkId: user.parkId,
      });

      res.json({
        token: partialToken,
        requiresTwoFa: true,
        twofaPending: true,
        keepLoggedIn: !!keepLoggedIn,
      });
      return;
    }

    // Case 2: 2FA enforced but user hasn't set it up yet
    if (enforcement === 'required' && !userHas2FA) {
      const partialToken = generatePartialToken({
        userId: user.id,
        email: user.email,
        role: user.role,
        companyId: user.companyId,
        parkId: user.parkId,
      });

      res.json({
        token: partialToken,
        requiresTwoFa: true,
        twofaPending: true,
        twofaSetupRequired: true,
        keepLoggedIn: !!keepLoggedIn,
      });
      return;
    }

    // Case 3: No 2FA needed — issue full token
    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
      parkId: user.parkId,
    }, !!keepLoggedIn);

    res.json({ token, user: sanitizeUser(user) });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user
router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const user = await UserModel.findById(req.user.userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json(sanitizeUser(user));
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// Refresh token (for keep-me-logged-in sessions)
router.post('/refresh', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const user = await UserModel.findById(req.user.userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
      parkId: user.parkId,
    }, true);

    res.json({ token });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
});

// Change password
router.post('/change-password', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'Current and new password are required' });
      return;
    }

    if (newPassword.length < 8) {
      res.status(400).json({ error: 'New password must be at least 8 characters' });
      return;
    }

    const user = await UserModel.findById(req.user.userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (user.authSource === 'ldap') {
      res.status(400).json({ error: 'Password changes are managed through your LDAP directory' });
      return;
    }

    if (user.authSource === 'oidc' || user.authSource === 'saml') {
      res.status(400).json({ error: 'Password changes are managed through your SSO identity provider' });
      return;
    }

    const isValid = await UserModel.validatePassword(user, currentPassword);
    if (!isValid) {
      res.status(401).json({ error: 'Current password is incorrect' });
      return;
    }

    await UserModel.update(user.id, { password: newPassword } as any);
    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

export default router;
