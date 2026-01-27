import { Router, Response } from 'express';
import { CompanyModel } from '../models/company.model';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth.middleware';

const router = Router();

// Get all companies
router.get('/', authenticate, (req: AuthRequest, res: Response) => {
  try {
    const companies = CompanyModel.findAll();
    res.json(companies);
  } catch (error) {
    console.error('Get companies error:', error);
    res.status(500).json({ error: 'Failed to get companies' });
  }
});

// Get single company
router.get('/:id', authenticate, (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const company = CompanyModel.findById(id);

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

// Create company (admin only)
router.post('/', authenticate, requireAdmin, (req: AuthRequest, res: Response) => {
  try {
    const { name, address } = req.body;

    if (!name || !address) {
      res.status(400).json({ error: 'Name and address are required' });
      return;
    }

    const company = CompanyModel.create({ name, address });
    res.status(201).json(company);
  } catch (error) {
    console.error('Create company error:', error);
    res.status(500).json({ error: 'Failed to create company' });
  }
});

// Update company (admin only)
router.put('/:id', authenticate, requireAdmin, (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, address } = req.body;

    const company = CompanyModel.update(id, { name, address });
    if (!company) {
      res.status(404).json({ error: 'Company not found' });
      return;
    }

    res.json(company);
  } catch (error) {
    console.error('Update company error:', error);
    res.status(500).json({ error: 'Failed to update company' });
  }
});

// Delete company (admin only)
router.delete('/:id', authenticate, requireAdmin, (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const deleted = CompanyModel.delete(id);
    if (!deleted) {
      res.status(404).json({ error: 'Company not found' });
      return;
    }

    res.status(204).send();
  } catch (error) {
    console.error('Delete company error:', error);
    res.status(500).json({ error: 'Failed to delete company' });
  }
});

export default router;
