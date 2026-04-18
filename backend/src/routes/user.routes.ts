import crypto from 'crypto';
import { Response, Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, AuthRequest, requireAdmin, requireCompanyAdminOrAbove } from '../middleware/auth.middleware';
import { UserModel } from '../models/user.model';
import { getDb } from '../models/database';
import { CompanyModel } from '../models/company.model';
import { TrustedDeviceModel } from '../models/trusted-device.model';
import { BookingModel } from '../models/booking.model';
import { UserRole } from '../types';
import { sendUserInviteEmail, sendUserSuspensionEmail } from '../services/email.service';
import { auditLog, AuditAction, getClientIp } from '../services/audit.service';

const router = Router();

// Rate limit user invite creation: 20 per hour per IP (prevents enumeration/spam)
const userInviteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { error: 'Too many invite requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Bulk import limiter: 3 requests per hour keyed by userId to prevent multi-IP bypass
const bulkImportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { error: 'Too many bulk import requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => req.user?.userId ?? 'unauthenticated',
});

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
      inviteToken: !!u.inviteToken,
      authSource: u.authSource,
      createdAt: u.createdAt,
      disabledUntil: u.disabledUntil,
      disableReason: u.disableReason,
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
      inviteToken: !!u.inviteToken,
      authSource: u.authSource,
      createdAt: u.createdAt,
      disabledUntil: u.disabledUntil,
      disableReason: u.disableReason,
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
router.post('/', authenticate, requireCompanyAdminOrAbove, userInviteLimiter, async (req: AuthRequest, res: Response) => {
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
    // Store SHA-256 hash of token in DB; send raw token in email link only
    const rawInviteToken = crypto.randomBytes(32).toString('hex');
    const inviteToken = crypto.createHash('sha256').update(rawInviteToken).digest('hex');
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
    const inviteLink = `${frontendUrl}/invite/${rawInviteToken}`;
    sendUserInviteEmail(email, inviteLink).catch((err: unknown) =>
      console.error('Failed to send invite email:', err)
    );

    auditLog({ userId: req.user!.userId, action: AuditAction.USER_CREATE, resourceType: 'user', resourceId: user.id, ipAddress: getClientIp(req), userAgent: req.headers['user-agent'], outcome: 'success', metadata: { role, companyId } });
    auditLog({ userId: req.user!.userId, action: AuditAction.USER_INVITE_SEND, resourceType: 'user', resourceId: user.id, ipAddress: getClientIp(req), userAgent: req.headers['user-agent'], outcome: 'success' });

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
    // Store SHA-256 hash of token in DB; send raw token in email link only
    const db = getDb();
    const rawInviteToken = crypto.randomBytes(32).toString('hex');
    const hashedInviteToken = crypto.createHash('sha256').update(rawInviteToken).digest('hex');
    const inviteTokenExpiry = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    await db('users').where('id', id).update({
      invite_token: hashedInviteToken,
      invite_token_expiry: inviteTokenExpiry,
      updated_at: new Date().toISOString(),
    });

    const frontendUrl = process.env.APP_URL || 'http://localhost';
    const inviteLink = `${frontendUrl}/invite/${rawInviteToken}`;
    sendUserInviteEmail(user.email, inviteLink).catch((err: unknown) =>
      console.error('Failed to resend invite email:', err)
    );

    auditLog({ userId: req.user!.userId, action: AuditAction.USER_INVITE_RESEND, resourceType: 'user', resourceId: id, ipAddress: getClientIp(req), userAgent: req.headers['user-agent'], outcome: 'success' });
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
    auditLog({ userId: req.user?.userId ?? null, action: AuditAction.USER_UPDATE, resourceType: 'user', resourceId: id, ipAddress: getClientIp(req), userAgent: req.headers['user-agent'] as string | undefined ?? null, outcome: 'success' });
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

    auditLog({ userId: req.user?.userId ?? null, action: AuditAction.USER_2FA_RESET, resourceType: 'user', resourceId: id, ipAddress: getClientIp(req), userAgent: req.headers['user-agent'] as string | undefined ?? null, outcome: 'success', metadata: { resetBy: req.user?.userId } });
    res.json({ message: '2FA reset successfully for user' });
  } catch (error) {
    console.error('Reset 2FA error:', error);
    res.status(500).json({ error: 'Failed to reset 2FA' });
  }
});

// Temporarily disable a user (park admin+)
router.post('/:id/disable', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { until, reason } = req.body;

    if (!until || isNaN(Date.parse(until))) {
      res.status(400).json({ error: 'A valid "until" ISO datetime is required' });
      return;
    }
    if (new Date(until) <= new Date()) {
      res.status(400).json({ error: '"until" must be in the future' });
      return;
    }

    const user = await UserModel.findById(id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Cannot disable yourself
    if (id === req.user!.userId) {
      res.status(400).json({ error: 'Cannot disable your own account' });
      return;
    }

    // Park admins can only disable users within their own park
    if (req.user!.role === UserRole.PARK_ADMIN && user.parkId !== req.user!.parkId) {
      res.status(403).json({ error: 'Park admins can only disable users within their own park' });
      return;
    }

    await UserModel.disable(id, until, reason ?? null);
    auditLog({ userId: req.user!.userId, action: AuditAction.USER_DISABLE, resourceType: 'user', resourceId: id, ipAddress: getClientIp(req), userAgent: req.headers['user-agent'], outcome: 'success', metadata: { until, reason: reason ?? null } });

    // Notify the user by email (best-effort)
    sendUserSuspensionEmail({ toEmail: user.email, userName: user.name, until, reason: reason ?? null })
      .catch((err: unknown) => console.error('Failed to send suspension email:', err));

    res.json({ message: 'User disabled', disabledUntil: until });
  } catch (error) {
    console.error('Disable user error:', error);
    res.status(500).json({ error: 'Failed to disable user' });
  }
});

// Re-enable a disabled user (park admin+)
router.post('/:id/enable', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const user = await UserModel.findById(id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Park admins can only enable users within their own park
    if (req.user!.role === UserRole.PARK_ADMIN && user.parkId !== req.user!.parkId) {
      res.status(403).json({ error: 'Park admins can only enable users within their own park' });
      return;
    }

    await UserModel.enable(id);
    auditLog({ userId: req.user!.userId, action: AuditAction.USER_ENABLE, resourceType: 'user', resourceId: id, ipAddress: getClientIp(req), userAgent: req.headers['user-agent'], outcome: 'success' });
    res.json({ message: 'User enabled' });
  } catch (error) {
    console.error('Enable user error:', error);
    res.status(500).json({ error: 'Failed to enable user' });
  }
});

// Export personal data — GDPR Article 15 (Right of Access)
// Users can only export their own data; admins can export any user in their scope.
router.get('/:id/export', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const requesterId = req.user!.userId;
    const requesterRole = req.user!.role;

    const isSelf = id === requesterId;
    const isAdmin = requesterRole === UserRole.SUPER_ADMIN || requesterRole === UserRole.PARK_ADMIN || requesterRole === UserRole.COMPANY_ADMIN;

    if (!isSelf && !isAdmin) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const user = await UserModel.findById(id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Company admins may only export users in their own company
    if (requesterRole === UserRole.COMPANY_ADMIN && user.companyId !== req.user!.companyId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const bookings = await BookingModel.findByUser(id);
    const devices = await TrustedDeviceModel.findByUser(id);

    auditLog({ userId: requesterId, action: AuditAction.USER_DATA_EXPORT, resourceType: 'user', resourceId: id, ipAddress: getClientIp(req), userAgent: req.headers['user-agent'], outcome: 'success' });

    res.json({
      exportedAt: new Date().toISOString(),
      profile: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        authSource: user.authSource,
        twofaEnabled: user.twofaEnabled,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      bookings: bookings.map(b => ({
        id: b.id,
        title: b.title,
        description: b.description,
        roomId: b.roomId,
        startTime: b.startTime,
        endTime: b.endTime,
        status: b.status,
        attendees: JSON.parse(b.attendees),
        externalGuests: JSON.parse(b.externalGuests),
        createdAt: b.createdAt,
      })),
      trustedDevices: devices.map(d => ({
        id: d.id,
        createdAt: d.createdAt,
        expiresAt: d.expiresAt,
      })),
    });
  } catch (error) {
    console.error('Export user data error:', error);
    res.status(500).json({ error: 'Failed to export user data' });
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

    const { reason } = req.body;
    await UserModel.delete(id, reason);
    auditLog({ userId: req.user!.userId, action: AuditAction.USER_DELETE, resourceType: 'user', resourceId: id, ipAddress: getClientIp(req), userAgent: req.headers['user-agent'], outcome: 'success', metadata: { reason } });
    res.status(204).send();
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Bulk import users (park admin+: can assign role/company or auto-create company for company_admin rows)
router.post('/bulk-import', authenticate, requireCompanyAdminOrAbove, bulkImportLimiter, userInviteLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { users: rawUsers } = req.body;

    if (!Array.isArray(rawUsers)) {
      res.status(400).json({ error: 'Request body must contain a "users" array' });
      return;
    }
    if (rawUsers.length === 0) {
      res.status(400).json({ error: 'At least one user is required' });
      return;
    }
    if (rawUsers.length > 50) {
      res.status(400).json({ error: 'Maximum 50 users per import' });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    const seenEmails = new Set<string>();
    for (let i = 0; i < rawUsers.length; i++) {
      const row = rawUsers[i];
      if (!row.email || typeof row.email !== 'string') {
        res.status(400).json({ error: `Row ${i + 1}: email is required` });
        return;
      }
      const normalizedEmail = row.email.toLowerCase().trim();
      if (!emailRegex.test(normalizedEmail) || normalizedEmail.length > 254) {
        res.status(400).json({ error: `Row ${i + 1}: invalid email format` });
        return;
      }
      if (seenEmails.has(normalizedEmail)) {
        res.status(400).json({ error: `Row ${i + 1}: duplicate email in batch (${normalizedEmail})` });
        return;
      }
      seenEmails.add(normalizedEmail);
      if (row.name && typeof row.name === 'string' && row.name.length > 100) {
        res.status(400).json({ error: `Row ${i + 1}: name must be 100 characters or fewer` });
        return;
      }
    }

    const requesterRole = req.user!.role;
    const frontendUrl = process.env.APP_URL || 'http://localhost';
    const results: Array<{ email: string; status: 'created' | 'skipped'; error?: string; userId?: string; companyCreated?: boolean }> = [];
    const createdUserIds: string[] = [];

    auditLog({
      userId: req.user!.userId,
      action: AuditAction.USER_BULK_IMPORT_START,
      resourceType: 'user',
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'],
      outcome: 'success',
      metadata: { requestedCount: rawUsers.length, importerRole: requesterRole, importerCompanyId: req.user!.companyId, importerParkId: req.user!.parkId },
    });

    for (const row of rawUsers) {
      const email = row.email.toLowerCase().trim();
      const name: string | undefined = row.name ? String(row.name).trim().slice(0, 100) : undefined;

      let effectiveRole: UserRole;
      let effectiveCompanyId: string;
      let companyWasCreated = false;

      if (requesterRole === UserRole.COMPANY_ADMIN) {
        // Company admin: force USER role and own company — ignore submitted values
        effectiveRole = UserRole.USER;
        effectiveCompanyId = req.user!.companyId;
      } else {
        // Park admin / super admin
        const submittedRole = row.role as UserRole;
        if (!submittedRole || !Object.values(UserRole).includes(submittedRole)) {
          effectiveRole = UserRole.USER;
        } else if (submittedRole === UserRole.SUPER_ADMIN && requesterRole !== UserRole.SUPER_ADMIN) {
          results.push({ email, status: 'skipped', error: 'Cannot create super admin users' });
          continue;
        } else {
          effectiveRole = submittedRole;
        }

        // Resolve company: by ID, by name (find or auto-create for company_admin), or require ID for others
        if (row.companyId && typeof row.companyId === 'string') {
          effectiveCompanyId = row.companyId;
        } else if (row.companyName && typeof row.companyName === 'string' && effectiveRole === UserRole.COMPANY_ADMIN) {
          // Auto-resolve or auto-create company by name for company_admin imports
          const parkId = req.user!.parkId;
          if (!parkId) {
            // Super admins have no park — they must supply an explicit companyId
            results.push({ email, status: 'skipped', error: 'companyId required — specify an existing company when importing as super admin' });
            continue;
          }
          const existing = await CompanyModel.findByNameAndPark(row.companyName.trim(), parkId);
          if (existing) {
            effectiveCompanyId = existing.id;
          } else {
            const newCompany = await CompanyModel.create({
              name: row.companyName.trim(),
              address: '',
              parkId,
              setupPending: true,
            });
            effectiveCompanyId = newCompany.id;
            companyWasCreated = true;
            auditLog({
              userId: req.user!.userId,
              action: AuditAction.COMPANY_CREATE,
              resourceType: 'company',
              resourceId: newCompany.id,
              ipAddress: getClientIp(req),
              userAgent: req.headers['user-agent'],
              outcome: 'success',
              metadata: { bulkImport: true, setupPending: true },
            });
          }
        } else {
          results.push({ email, status: 'skipped', error: 'companyId or companyName is required' });
          continue;
        }
      }

      const company = await CompanyModel.findById(effectiveCompanyId);
      if (!company) {
        results.push({ email, status: 'skipped', error: 'Company not found' });
        continue;
      }
      if (requesterRole === UserRole.PARK_ADMIN && company.parkId !== req.user!.parkId) {
        results.push({ email, status: 'skipped', error: 'Company is not in your park' });
        continue;
      }

      const existingUser = await UserModel.findByEmail(email);
      if (existingUser) {
        results.push({ email, status: 'skipped', error: 'already_exists' });
        continue;
      }

      const rawInviteToken = crypto.randomBytes(32).toString('hex');
      const inviteToken = crypto.createHash('sha256').update(rawInviteToken).digest('hex');
      const inviteTokenExpiry = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

      const user = await UserModel.createInvited({
        email,
        role: effectiveRole,
        companyId: effectiveCompanyId,
        parkId: company.parkId,
        addonRoles: [],
        inviteToken,
        inviteTokenExpiry,
      });

      if (name) {
        const db = getDb();
        await db('users').where('id', user.id).update({ name, updated_at: new Date().toISOString() });
      }

      const inviteLink = `${frontendUrl}/invite/${rawInviteToken}`;
      sendUserInviteEmail(email, inviteLink).catch((err: unknown) =>
        console.error('Failed to send bulk invite email:', err)
      );

      auditLog({ userId: req.user!.userId, action: AuditAction.USER_CREATE, resourceType: 'user', resourceId: user.id, ipAddress: getClientIp(req), userAgent: req.headers['user-agent'], outcome: 'success', metadata: { role: effectiveRole, companyId: effectiveCompanyId, bulkImport: true } });
      auditLog({ userId: req.user!.userId, action: AuditAction.USER_INVITE_SEND, resourceType: 'user', resourceId: user.id, ipAddress: getClientIp(req), userAgent: req.headers['user-agent'], outcome: 'success' });

      results.push({ email, status: 'created', userId: user.id, companyCreated: companyWasCreated || undefined });
      createdUserIds.push(user.id);
    }

    const created = results.filter(r => r.status === 'created').length;
    const skipped = results.filter(r => r.status === 'skipped').length;

    auditLog({
      userId: req.user!.userId,
      action: AuditAction.USER_BULK_IMPORT_COMPLETE,
      resourceType: 'user',
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'],
      outcome: skipped > 0 && created === 0 ? 'failure' : 'success',
      metadata: { requestedCount: rawUsers.length, createdCount: created, skippedCount: skipped, createdUserIds, importerRole: requesterRole },
    });

    res.json({ results, created, skipped });
  } catch (error) {
    console.error('Bulk import error:', error);
    res.status(500).json({ error: 'Failed to process bulk import' });
  }
});

export default router;
