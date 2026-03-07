import { Router, Response } from 'express';
import { CompanyModel } from '../models/company.model';
import { authenticate, requireAdmin, requireCompanyAdminOrAbove, AuthRequest } from '../middleware/auth.middleware';
import { UserRole } from '../types';
import { auditLog, AuditAction, getClientIp } from '../services/audit.service';

const router = Router();

// Get all companies (filtered by park for non-super admins)
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const queryParkId = req.query.parkId as string | undefined;

    // Super admins can optionally filter by park, others see only their park's companies
    let parkId: string | undefined | null;
    if (req.user?.role === UserRole.SUPER_ADMIN) {
      parkId = queryParkId || undefined;
    } else {
      parkId = req.user?.parkId;
    }
    const companies = await CompanyModel.findAll(parkId);
    res.json(companies);
  } catch (error) {
    console.error('Get companies error:', error);
    res.status(500).json({ error: 'Failed to get companies' });
  }
});

// Get single company
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const company = await CompanyModel.findById(id);

    if (!company) {
      res.status(404).json({ error: 'Company not found' });
      return;
    }

    res.json(company);
  } catch (error) {
    console.error('Get company error:', error);
    res.status(500).json({ error: 'Failed to get company' });
  }
});

// Create company (park admin or above)
router.post('/', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { name, address, parkId } = req.body;

    if (!name || !address) {
      res.status(400).json({ error: 'Name and address are required' });
      return;
    }

    // Determine which park to create the company in
    let targetParkId = parkId;
    if (req.user?.role === UserRole.SUPER_ADMIN) {
      // Super admin can specify parkId, defaults to 'default' if not provided
      targetParkId = parkId || 'default';
    } else {
      // Park admins can only create companies in their own park
      targetParkId = req.user?.parkId;
      if (!targetParkId) {
        res.status(400).json({ error: 'User is not assigned to a park' });
        return;
      }
    }

    const company = await CompanyModel.create({ name, address, parkId: targetParkId });

    auditLog({
      userId: req.user?.userId ?? null,
      action: AuditAction.COMPANY_CREATE,
      resourceType: 'company',
      resourceId: company.id,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] as string | undefined ?? null,
      outcome: 'success',
    });

    res.status(201).json(company);
  } catch (error) {
    console.error('Create company error:', error);
    res.status(500).json({ error: 'Failed to create company' });
  }
});

// Update company (park admin or above)
router.put('/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, address, parkId, twofaEnforcement } = req.body;

    // Only super admins can change parkId
    const updateData: any = { name, address };
    if (req.user?.role === UserRole.SUPER_ADMIN && parkId !== undefined) {
      updateData.parkId = parkId;
    }
    // Park admins and above can set 2FA enforcement for a company
    if (twofaEnforcement !== undefined) {
      updateData.twofaEnforcement = twofaEnforcement;
    }

    const company = await CompanyModel.update(id, updateData);
    if (!company) {
      res.status(404).json({ error: 'Company not found' });
      return;
    }

    auditLog({
      userId: req.user?.userId ?? null,
      action: AuditAction.COMPANY_UPDATE,
      resourceType: 'company',
      resourceId: id,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] as string | undefined ?? null,
      outcome: 'success',
    });

    res.json(company);
  } catch (error) {
    console.error('Update company error:', error);
    res.status(500).json({ error: 'Failed to update company' });
  }
});

// Update company 2FA enforcement (company admin for own company, park admin for any in their park, super admin for any)
router.put('/:id/twofa', authenticate, requireCompanyAdminOrAbove, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { twofaEnforcement } = req.body;

    // Company admin can only update their own company
    if (req.user?.role === UserRole.COMPANY_ADMIN && req.user?.companyId !== id) {
      res.status(403).json({ error: 'Access denied to this company' });
      return;
    }

    if (!['inherit', 'optional', 'required'].includes(twofaEnforcement)) {
      res.status(400).json({ error: 'Invalid twofaEnforcement value' });
      return;
    }

    const company = await CompanyModel.update(id, { twofaEnforcement });
    if (!company) {
      res.status(404).json({ error: 'Company not found' });
      return;
    }

    auditLog({
      userId: req.user?.userId ?? null,
      action: AuditAction.COMPANY_UPDATE,
      resourceType: 'company',
      resourceId: id,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] as string | undefined ?? null,
      outcome: 'success',
      metadata: { twofaEnforcement },
    });

    res.json(company);
  } catch (error) {
    console.error('Update company 2FA error:', error);
    res.status(500).json({ error: 'Failed to update company 2FA settings' });
  }
});

// Delete company (park admin or above)
router.delete('/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const deleted = await CompanyModel.delete(id);
    if (!deleted) {
      res.status(404).json({ error: 'Company not found' });
      return;
    }

    auditLog({
      userId: req.user?.userId ?? null,
      action: AuditAction.COMPANY_DELETE,
      resourceType: 'company',
      resourceId: id,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] as string | undefined ?? null,
      outcome: 'success',
    });

    res.status(204).send();
  } catch (error) {
    console.error('Delete company error:', error);
    res.status(500).json({ error: 'Failed to delete company' });
  }
});

export default router;
