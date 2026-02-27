import crypto from 'crypto';
import { Response, Router } from 'express';
import { authenticate, AuthRequest, requireAdmin, requireCompanyAdminOrAbove } from '../middleware/auth.middleware';
import { UserModel } from '../models/user.model';
import { getDb } from '../models/database';
import { CompanyModel } from '../models/company.model';
import { TrustedDeviceModel } from '../models/trusted-device.model';
import { UserRole } from '../types';
import { sendUserInviteEmail } from '../services/email.service';

const router = Router();

// Get all users (admin only)
router.get('/', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const queryParkId = req.query.parkId as string | undefined;

    // Super admins can optionally filter by park, park admins see only their park's users
    let parkId: string | undefined | null;
    if (req.user?.role === UserRole.SUPER_ADMIN) {
      parkId = queryParkId || undefined;
    } else {
      parkId = req.user?.parkId;
    }

    const users = await UserModel.findAll(parkId);
    res.json(users.map(u => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      companyId: u.companyId,
      parkId: u.parkId,
      addonRoles: u.addonRoles,
      isActive: u.isActive,
      authSource: u.authSource,
      createdAt: u.createdAt
    })));
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
});

// Get users by company (company admin or admin)
router.get('/company/:companyId', authenticate, requireCompanyAdminOrAbove, async (req: AuthRequest, res: Response) => {
  try {
    const { companyId } = req.params;

    // Company admins can only see their own company's users
    if (req.user!.role === UserRole.COMPANY_ADMIN && req.user!.companyId !== companyId) {
      res.status(403).json({ error: 'Cannot view users from other companies' });
      return;
    }

    let users = await UserModel.findByCompany(companyId);

    // Company admins must not see park-level privileged users (PARK_ADMIN, SUPER_ADMIN)
    // even if those users happen to share the same companyId
    if (req.user!.role === UserRole.COMPANY_ADMIN) {
      users = users.filter(u => u.role !== UserRole.PARK_ADMIN && u.role !== UserRole.SUPER_ADMIN);
    }

    res.json(users.map(u => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      companyId: u.companyId,
      addonRoles: u.addonRoles,
      isActive: u.isActive,
      authSource: u.authSource,
      createdAt: u.createdAt
    })));
  } catch (error) {
    console.error('Get company users error:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
});

// Get single user
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const user = await UserModel.findById(id);

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Regular users can only see themselves
    if (req.user!.role === UserRole.USER && req.user!.userId !== id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Company admins can only see users in their company
    if (req.user!.role === UserRole.COMPANY_ADMIN && req.user!.companyId !== user.companyId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      companyId: user.companyId,
      addonRoles: user.addonRoles,
      createdAt: user.createdAt
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// Create user (sends invite email — admin only provides email, role, companyId)
router.post('/', authenticate, requireCompanyAdminOrAbove, async (req: AuthRequest, res: Response) => {
  try {
    const { email, role, companyId, addonRoles } = req.body;

    // Validation
    if (!email || !role || !companyId) {
      res.status(400).json({ error: 'Email, role, and company are required' });
      return;
    }

    // Check if email already exists
    const existingUser = await UserModel.findByEmail(email);
    if (existingUser) {
      res.status(400).json({ error: 'Email already registered' });
      return;
    }

    // Company admins can only create regular users in their company
    if (req.user!.role === UserRole.COMPANY_ADMIN) {
      if (companyId !== req.user!.companyId) {
        res.status(403).json({ error: 'Cannot create users in other companies' });
        return;
      }
      if (role !== UserRole.USER) {
        res.status(403).json({ error: 'Company admins can only create regular users' });
        return;
      }
    }

    // Only super admins and park admins can create park admin users
    if (role === UserRole.PARK_ADMIN && req.user!.role !== UserRole.PARK_ADMIN && req.user!.role !== UserRole.SUPER_ADMIN) {
      res.status(403).json({ error: 'Only admins can create Park admin users' });
      return;
    }

    // Look up the company to validate it exists and to get its parkId for the new user
    const company = await CompanyModel.findById(companyId);
    if (!company) {
      res.status(400).json({ error: 'Company not found' });
      return;
    }

    // Park admins can only create park admins within their own park
    if (role === UserRole.PARK_ADMIN && req.user!.role === UserRole.PARK_ADMIN) {
      if (company.parkId !== req.user!.parkId) {
        res.status(403).json({ error: 'Park admins can only create park admins within their own park' });
        return;
      }
    }

    if (role === UserRole.SUPER_ADMIN && req.user!.role !== UserRole.SUPER_ADMIN) {
      res.status(403).json({ error: 'Only super admins can create super admin users' });
      return;
    }

    // Only park admins and above can set addon roles
    const effectiveAddonRoles = (req.user!.role === UserRole.PARK_ADMIN || req.user!.role === UserRole.SUPER_ADMIN)
      ? (addonRoles || []) : [];

    // Generate invite token (48h expiry)
    const inviteToken = crypto.randomBytes(32).toString('hex');
    const inviteTokenExpiry = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

    const user = await UserModel.createInvited({
      email,
      role,
      companyId,
      parkId: company.parkId,
      addonRoles: effectiveAddonRoles,
      inviteToken,
      inviteTokenExpiry,
    });

    // Send invite email (best-effort — don't fail the request if email fails)
    const frontendUrl = process.env.APP_URL || 'http://localhost';
    const inviteLink = `${frontendUrl}/invite/${inviteToken}`;
    sendUserInviteEmail(email, inviteLink).catch((err: unknown) =>
      console.error('Failed to send invite email:', err)
    );

    res.status(201).json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      companyId: user.companyId,
      addonRoles: user.addonRoles,
      isActive: user.isActive,
      createdAt: user.createdAt
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Resend invite email
router.post('/:id/resend-invite', authenticate, requireCompanyAdminOrAbove, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const user = await UserModel.findById(id);

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (user.isActive !== false || !user.inviteToken) {
      res.status(400).json({ error: 'User has already completed account setup' });
      return;
    }

    // Issue a fresh token with a new 48h window
    const db = getDb();
    const inviteToken = crypto.randomBytes(32).toString('hex');
    const inviteTokenExpiry = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    await db('users').where('id', id).update({
      invite_token: inviteToken,
      invite_token_expiry: inviteTokenExpiry,
      updated_at: new Date().toISOString(),
    });

    const frontendUrl = process.env.APP_URL || 'http://localhost';
    const inviteLink = `${frontendUrl}/invite/${inviteToken}`;
    sendUserInviteEmail(user.email, inviteLink).catch((err: unknown) =>
      console.error('Failed to resend invite email:', err)
    );

    res.json({ message: 'Invite resent' });
  } catch (error) {
    console.error('Resend invite error:', error);
    res.status(500).json({ error: 'Failed to resend invite' });
  }
});

// Update user
router.put('/:id', authenticate, requireCompanyAdminOrAbove, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { email, name, role, companyId, password, addonRoles } = req.body;

    const existingUser = await UserModel.findById(id);
    if (!existingUser) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Company admins can only update users in their company
    if (req.user!.role === UserRole.COMPANY_ADMIN) {
      if (existingUser.companyId !== req.user!.companyId) {
        res.status(403).json({ error: 'Cannot update users from other companies' });
        return;
      }
      // Cannot change role to admin or company_admin
      if (role && role !== UserRole.USER) {
        res.status(403).json({ error: 'Cannot change user role to admin' });
        return;
      }
      // Cannot change company
      if (companyId && companyId !== req.user!.companyId) {
        res.status(403).json({ error: 'Cannot move user to another company' });
        return;
      }
    }

    // Cannot change admin's role unless you're an admin
    if (existingUser.role === UserRole.PARK_ADMIN && req.user!.role !== UserRole.PARK_ADMIN && req.user!.role !== UserRole.SUPER_ADMIN) {
      res.status(403).json({ error: 'Cannot modify admin users' });
      return;
    }

    // Park admins can only modify users within their own park
    if (req.user!.role === UserRole.PARK_ADMIN && existingUser.parkId !== req.user!.parkId) {
      res.status(403).json({ error: 'Park admins can only modify users within their own park' });
      return;
    }

    // Check email uniqueness if changing
    if (email && email !== existingUser.email) {
      const emailExists = await UserModel.findByEmail(email);
      if (emailExists) {
        res.status(400).json({ error: 'Email already in use' });
        return;
      }
    }

    // Block password changes for LDAP/SSO-sourced users
    if (existingUser.authSource !== 'local' && password) {
      res.status(400).json({ error: 'Cannot change password for externally authenticated users' });
      return;
    }

    const updateData: any = {};
    if (email) updateData.email = email;
    if (name) updateData.name = name;
    if (role && (req.user!.role === UserRole.PARK_ADMIN || req.user!.role === UserRole.SUPER_ADMIN)) updateData.role = role;
    if (companyId && (req.user!.role === UserRole.PARK_ADMIN || req.user!.role === UserRole.SUPER_ADMIN)) updateData.companyId = companyId;
    if (password) updateData.password = password;
    if (addonRoles !== undefined && (req.user!.role === UserRole.PARK_ADMIN || req.user!.role === UserRole.SUPER_ADMIN)) {
      updateData.addonRoles = addonRoles;
    }

    const user = await UserModel.update(id, updateData);
    res.json({
      id: user!.id,
      email: user!.email,
      name: user!.name,
      role: user!.role,
      companyId: user!.companyId,
      addonRoles: user!.addonRoles,
      createdAt: user!.createdAt
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Reset 2FA for a user (park admin or above)
router.post('/:id/reset-2fa', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const user = await UserModel.findById(id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Park admins can only reset users within their own park
    if (req.user!.role === UserRole.PARK_ADMIN && user.parkId !== req.user!.parkId) {
      res.status(403).json({ error: 'Park admins can only reset 2FA for users within their own park' });
      return;
    }

    await UserModel.disableTwoFa(user.id);
    await TrustedDeviceModel.deleteAllForUser(user.id);

    res.json({ message: '2FA reset successfully for user' });
  } catch (error) {
    console.error('Reset 2FA error:', error);
    res.status(500).json({ error: 'Failed to reset 2FA' });
  }
});

// Delete user
router.delete('/:id', authenticate, requireCompanyAdminOrAbove, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const user = await UserModel.findById(id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Cannot delete yourself
    if (id === req.user!.userId) {
      res.status(400).json({ error: 'Cannot delete your own account' });
      return;
    }

    // Company admins can only delete users in their company
    if (req.user!.role === UserRole.COMPANY_ADMIN) {
      if (user.companyId !== req.user!.companyId) {
        res.status(403).json({ error: 'Cannot delete users from other companies' });
        return;
      }
      // Cannot delete admins or other company admins
      if (user.role !== UserRole.USER) {
        res.status(403).json({ error: 'Cannot delete admin users' });
        return;
      }
    }

    // Only admins can delete admin users
    if (user.role === UserRole.PARK_ADMIN && req.user!.role !== UserRole.PARK_ADMIN && req.user!.role !== UserRole.SUPER_ADMIN) {
      res.status(403).json({ error: 'Cannot delete admin users' });
      return;
    }

    // Park admins can only delete users within their own park
    if (req.user!.role === UserRole.PARK_ADMIN && user.parkId !== req.user!.parkId) {
      res.status(403).json({ error: 'Park admins can only delete users within their own park' });
      return;
    }

    await UserModel.delete(id);
    res.status(204).send();
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

export default router;
