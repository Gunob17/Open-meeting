import { Router, Response } from 'express';
import { UserModel } from '../models/user.model';
import { authenticate, requireAdmin, requireCompanyAdminOrAbove, AuthRequest } from '../middleware/auth.middleware';
import { UserRole } from '../types';

const router = Router();

// Get all users (admin only)
router.get('/', authenticate, requireAdmin, (req: AuthRequest, res: Response) => {
  try {
    const queryParkId = req.query.parkId as string | undefined;

    // Super admins can optionally filter by park, park admins see only their park's users
    let parkId: string | undefined | null;
    if (req.user?.role === UserRole.SUPER_ADMIN) {
      parkId = queryParkId || undefined;
    } else {
      parkId = req.user?.parkId;
    }

    const users = UserModel.findAll(parkId);
    res.json(users.map(u => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      companyId: u.companyId,
      parkId: u.parkId,
      createdAt: u.createdAt
    })));
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
});

// Get users by company (company admin or admin)
router.get('/company/:companyId', authenticate, requireCompanyAdminOrAbove, (req: AuthRequest, res: Response) => {
  try {
    const { companyId } = req.params;

    // Company admins can only see their own company's users
    if (req.user!.role === UserRole.COMPANY_ADMIN && req.user!.companyId !== companyId) {
      res.status(403).json({ error: 'Cannot view users from other companies' });
      return;
    }

    const users = UserModel.findByCompany(companyId);
    res.json(users.map(u => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      companyId: u.companyId,
      createdAt: u.createdAt
    })));
  } catch (error) {
    console.error('Get company users error:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
});

// Get single user
router.get('/:id', authenticate, (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const user = UserModel.findById(id);

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
      createdAt: user.createdAt
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// Create user
router.post('/', authenticate, requireCompanyAdminOrAbove, async (req: AuthRequest, res: Response) => {
  try {
    const { email, password, name, role, companyId } = req.body;

    // Validation
    if (!email || !password || !name || !role || !companyId) {
      res.status(400).json({ error: 'All fields are required' });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters' });
      return;
    }

    // Check if email already exists
    const existingUser = UserModel.findByEmail(email);
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

    // Only system admins can create admin users
    if (role === UserRole.PARK_ADMIN && req.user!.role !== UserRole.PARK_ADMIN) {
      res.status(403).json({ error: 'Only admins can create admin users' });
      return;
    }

    const user = await UserModel.create({ email, password, name, role, companyId });
    res.status(201).json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      companyId: user.companyId,
      createdAt: user.createdAt
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Update user
router.put('/:id', authenticate, requireCompanyAdminOrAbove, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { email, name, role, companyId, password } = req.body;

    const existingUser = UserModel.findById(id);
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
    if (existingUser.role === UserRole.PARK_ADMIN && req.user!.role !== UserRole.PARK_ADMIN) {
      res.status(403).json({ error: 'Cannot modify admin users' });
      return;
    }

    // Check email uniqueness if changing
    if (email && email !== existingUser.email) {
      const emailExists = UserModel.findByEmail(email);
      if (emailExists) {
        res.status(400).json({ error: 'Email already in use' });
        return;
      }
    }

    const updateData: any = {};
    if (email) updateData.email = email;
    if (name) updateData.name = name;
    if (role && req.user!.role === UserRole.PARK_ADMIN) updateData.role = role;
    if (companyId && req.user!.role === UserRole.PARK_ADMIN) updateData.companyId = companyId;
    if (password) updateData.password = password;

    const user = await UserModel.update(id, updateData);
    res.json({
      id: user!.id,
      email: user!.email,
      name: user!.name,
      role: user!.role,
      companyId: user!.companyId,
      createdAt: user!.createdAt
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Delete user
router.delete('/:id', authenticate, requireCompanyAdminOrAbove, (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const user = UserModel.findById(id);
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
    if (user.role === UserRole.PARK_ADMIN && req.user!.role !== UserRole.PARK_ADMIN) {
      res.status(403).json({ error: 'Cannot delete admin users' });
      return;
    }

    UserModel.delete(id);
    res.status(204).send();
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

export default router;
