import { Router, Response } from 'express';
import { CompanyModel } from '../models/company.model';
import { UserModel } from '../models/user.model';
import { RoomModel } from '../models/room.model';
import { UserRole } from '../types';
import db from '../models/database';

const router = Router();

// Check if system has been set up
router.get('/status', (req, res: Response) => {
  try {
    // Count only real users (exclude system users like device-booking-user)
    const stmt = db.prepare("SELECT COUNT(*) as count FROM users WHERE company_id != 'system'");
    const result = stmt.get() as { count: number };

    res.json({
      isSetup: result.count > 0,
      hasUsers: result.count > 0
    });
  } catch (error) {
    console.error('Setup status error:', error);
    res.status(500).json({ error: 'Failed to check setup status' });
  }
});

// Initialize with demo data
router.post('/demo', async (req, res: Response) => {
  try {
    // Check if already set up (exclude system users)
    const stmt = db.prepare("SELECT COUNT(*) as count FROM users WHERE company_id != 'system'");
    const result = stmt.get() as { count: number };

    if (result.count > 0) {
      res.status(400).json({ error: 'System is already set up' });
      return;
    }

    // Use default park for demo data
    const defaultParkId = 'default';

    // Create demo companies
    const sharedOffice = CompanyModel.create({
      name: 'Shared Office Management',
      address: '123 Business Center, Suite 100, New York, NY 10001',
      parkId: defaultParkId
    });

    const techCorp = CompanyModel.create({
      name: 'TechCorp Inc.',
      address: '456 Innovation Drive, San Francisco, CA 94105',
      parkId: defaultParkId
    });

    const startupHub = CompanyModel.create({
      name: 'StartupHub',
      address: '789 Entrepreneur Way, Austin, TX 78701',
      parkId: defaultParkId
    });

    // Create demo users
    await UserModel.create({
      email: 'admin@sharedoffice.com',
      password: 'admin123',
      name: 'System Administrator',
      role: UserRole.SUPER_ADMIN,
      companyId: sharedOffice.id,
      parkId: null  // Super admin has no park restriction
    });

    await UserModel.create({
      email: 'admin@techcorp.com',
      password: 'techcorp123',
      name: 'TechCorp Admin',
      role: UserRole.COMPANY_ADMIN,
      companyId: techCorp.id,
      parkId: defaultParkId
    });

    await UserModel.create({
      email: 'admin@startuphub.com',
      password: 'startup123',
      name: 'StartupHub Admin',
      role: UserRole.COMPANY_ADMIN,
      companyId: startupHub.id,
      parkId: defaultParkId
    });

    await UserModel.create({
      email: 'john@techcorp.com',
      password: 'john123',
      name: 'John Smith',
      role: UserRole.USER,
      companyId: techCorp.id,
      parkId: defaultParkId
    });

    await UserModel.create({
      email: 'jane@techcorp.com',
      password: 'jane123',
      name: 'Jane Doe',
      role: UserRole.USER,
      companyId: techCorp.id,
      parkId: defaultParkId
    });

    await UserModel.create({
      email: 'bob@startuphub.com',
      password: 'bob123',
      name: 'Bob Wilson',
      role: UserRole.USER,
      companyId: startupHub.id,
      parkId: defaultParkId
    });

    // Create demo meeting rooms
    RoomModel.create({
      name: 'Innovation Lab',
      capacity: 20,
      amenities: ['Projector', 'Whiteboard', 'Video Conferencing', 'Air Conditioning'],
      floor: '3rd Floor',
      address: '123 Business Center, Suite 100, Room 301, New York, NY 10001',
      description: 'Large meeting room ideal for workshops and presentations',
      parkId: defaultParkId
    });

    RoomModel.create({
      name: 'Brainstorm Studio',
      capacity: 8,
      amenities: ['Whiteboard', 'TV Screen', 'Standing Desk'],
      floor: '2nd Floor',
      address: '123 Business Center, Suite 100, Room 205, New York, NY 10001',
      description: 'Creative space for team brainstorming sessions',
      parkId: defaultParkId
    });

    RoomModel.create({
      name: 'Executive Boardroom',
      capacity: 12,
      amenities: ['Video Conferencing', 'Projector', 'Conference Phone', 'Catering Service'],
      floor: '4th Floor',
      address: '123 Business Center, Suite 100, Room 401, New York, NY 10001',
      description: 'Premium meeting room for executive meetings and client presentations',
      parkId: defaultParkId
    });

    RoomModel.create({
      name: 'Focus Pod A',
      capacity: 4,
      amenities: ['TV Screen', 'Whiteboard'],
      floor: '1st Floor',
      address: '123 Business Center, Suite 100, Room 102, New York, NY 10001',
      description: 'Small meeting pod for quick discussions',
      parkId: defaultParkId
    });

    RoomModel.create({
      name: 'Focus Pod B',
      capacity: 4,
      amenities: ['TV Screen', 'Whiteboard'],
      floor: '1st Floor',
      address: '123 Business Center, Suite 100, Room 103, New York, NY 10001',
      description: 'Small meeting pod for quick discussions',
      parkId: defaultParkId
    });

    RoomModel.create({
      name: 'Training Center',
      capacity: 30,
      amenities: ['Projector', 'Multiple Screens', 'Microphones', 'Recording Equipment', 'Air Conditioning'],
      floor: '5th Floor',
      address: '123 Business Center, Suite 100, Room 501, New York, NY 10001',
      description: 'Large training room for seminars and workshops',
      parkId: defaultParkId
    });

    res.json({
      success: true,
      message: 'Demo data created successfully',
      credentials: {
        admin: { email: 'admin@sharedoffice.com', password: 'admin123' },
        companyAdmin: { email: 'admin@techcorp.com', password: 'techcorp123' },
        user: { email: 'john@techcorp.com', password: 'john123' }
      }
    });
  } catch (error) {
    console.error('Demo setup error:', error);
    res.status(500).json({ error: 'Failed to create demo data' });
  }
});

// Initialize with production setup (create first admin)
router.post('/production', async (req, res: Response) => {
  try {
    const { companyName, companyAddress, adminName, adminEmail, adminPassword } = req.body;

    // Validation
    if (!companyName || !companyAddress || !adminName || !adminEmail || !adminPassword) {
      res.status(400).json({ error: 'All fields are required' });
      return;
    }

    if (adminPassword.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters' });
      return;
    }

    // Check if already set up (exclude system users)
    const stmt = db.prepare("SELECT COUNT(*) as count FROM users WHERE company_id != 'system'");
    const result = stmt.get() as { count: number };

    if (result.count > 0) {
      res.status(400).json({ error: 'System is already set up' });
      return;
    }

    // Use default park
    const defaultParkId = 'default';

    // Create the company
    const company = CompanyModel.create({
      name: companyName,
      address: companyAddress,
      parkId: defaultParkId
    });

    // Create the admin user (super admin for first setup)
    const admin = await UserModel.create({
      email: adminEmail,
      password: adminPassword,
      name: adminName,
      role: UserRole.SUPER_ADMIN,
      companyId: company.id,
      parkId: null  // Super admin has no park restriction
    });

    res.json({
      success: true,
      message: 'Production setup completed successfully',
      admin: {
        id: admin.id,
        email: admin.email,
        name: admin.name
      }
    });
  } catch (error) {
    console.error('Production setup error:', error);
    res.status(500).json({ error: 'Failed to complete production setup' });
  }
});

export default router;
