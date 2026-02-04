import { Router, Response } from 'express';
import { CompanyModel } from '../models/company.model';
import { UserModel } from '../models/user.model';
import { RoomModel } from '../models/room.model';
import { ParkModel } from '../models/park.model';
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

    // Update default park name
    ParkModel.update('default', {
      name: 'Downtown Business Park',
      address: '123 Business Center, New York, NY 10001',
      description: 'Main downtown location with premium meeting facilities'
    });

    // Create second park
    const techPark = ParkModel.create({
      name: 'Tech Innovation Hub',
      address: '456 Silicon Valley Blvd, San Jose, CA 95110',
      description: 'Modern tech campus with state-of-the-art facilities'
    });

    // Create third park
    const creativePark = ParkModel.create({
      name: 'Creative Arts Center',
      address: '789 Arts District, Los Angeles, CA 90012',
      description: 'Creative workspace designed for media and design companies'
    });

    // =====================
    // DOWNTOWN BUSINESS PARK (default)
    // =====================
    const defaultParkId = 'default';

    // Create companies for Downtown Park
    const sharedOffice = CompanyModel.create({
      name: 'Shared Office Management',
      address: '123 Business Center, Suite 100, New York, NY 10001',
      parkId: defaultParkId
    });

    const techCorp = CompanyModel.create({
      name: 'TechCorp Inc.',
      address: '123 Business Center, Suite 200, New York, NY 10001',
      parkId: defaultParkId
    });

    const startupHub = CompanyModel.create({
      name: 'StartupHub',
      address: '123 Business Center, Suite 300, New York, NY 10001',
      parkId: defaultParkId
    });

    // Create users for Downtown Park
    await UserModel.create({
      email: 'admin@openmeeting.com',
      password: 'admin123',
      name: 'Super Administrator',
      role: UserRole.SUPER_ADMIN,
      companyId: sharedOffice.id,
      parkId: null  // Super admin has no park restriction
    });

    await UserModel.create({
      email: 'parkadmin@downtown.com',
      password: 'parkadmin123',
      name: 'Downtown Park Admin',
      role: UserRole.PARK_ADMIN,
      companyId: sharedOffice.id,
      parkId: defaultParkId
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

    // Create meeting rooms for Downtown Park
    RoomModel.create({
      name: 'Innovation Lab',
      capacity: 20,
      amenities: ['Projector', 'Whiteboard', 'Video Conferencing', 'Air Conditioning'],
      floor: '3rd Floor',
      address: '123 Business Center, Room 301',
      description: 'Large meeting room ideal for workshops and presentations',
      parkId: defaultParkId
    });

    RoomModel.create({
      name: 'Brainstorm Studio',
      capacity: 8,
      amenities: ['Whiteboard', 'TV Screen', 'Standing Desk'],
      floor: '2nd Floor',
      address: '123 Business Center, Room 205',
      description: 'Creative space for team brainstorming sessions',
      parkId: defaultParkId
    });

    RoomModel.create({
      name: 'Executive Boardroom',
      capacity: 12,
      amenities: ['Video Conferencing', 'Projector', 'Conference Phone', 'Catering Service'],
      floor: '4th Floor',
      address: '123 Business Center, Room 401',
      description: 'Premium meeting room for executive meetings',
      parkId: defaultParkId
    });

    RoomModel.create({
      name: 'Focus Pod A',
      capacity: 4,
      amenities: ['TV Screen', 'Whiteboard'],
      floor: '1st Floor',
      address: '123 Business Center, Room 102',
      description: 'Small meeting pod for quick discussions',
      parkId: defaultParkId
    });

    // =====================
    // TECH INNOVATION HUB
    // =====================

    // Create companies for Tech Park
    const innovateTech = CompanyModel.create({
      name: 'InnovateTech Solutions',
      address: '456 Silicon Valley Blvd, Building A',
      parkId: techPark.id
    });

    const aiStartup = CompanyModel.create({
      name: 'AI Dynamics',
      address: '456 Silicon Valley Blvd, Building B',
      parkId: techPark.id
    });

    // Create users for Tech Park
    await UserModel.create({
      email: 'parkadmin@techhub.com',
      password: 'techhub123',
      name: 'Tech Hub Park Admin',
      role: UserRole.PARK_ADMIN,
      companyId: innovateTech.id,
      parkId: techPark.id
    });

    await UserModel.create({
      email: 'sarah@innovatetech.com',
      password: 'sarah123',
      name: 'Sarah Connor',
      role: UserRole.COMPANY_ADMIN,
      companyId: innovateTech.id,
      parkId: techPark.id
    });

    await UserModel.create({
      email: 'mike@aidynamics.com',
      password: 'mike123',
      name: 'Mike Chen',
      role: UserRole.USER,
      companyId: aiStartup.id,
      parkId: techPark.id
    });

    // Create meeting rooms for Tech Park
    RoomModel.create({
      name: 'Quantum Lab',
      capacity: 15,
      amenities: ['Multiple Screens', 'Video Conferencing', '3D Display', 'Whiteboard'],
      floor: '2nd Floor',
      address: '456 Silicon Valley Blvd, Building A, Room 201',
      description: 'High-tech lab for technical presentations and demos',
      parkId: techPark.id
    });

    RoomModel.create({
      name: 'Agile Room',
      capacity: 10,
      amenities: ['Kanban Board', 'Whiteboard', 'Standing Desks', 'TV Screen'],
      floor: '1st Floor',
      address: '456 Silicon Valley Blvd, Building A, Room 105',
      description: 'Designed for agile ceremonies and sprint planning',
      parkId: techPark.id
    });

    RoomModel.create({
      name: 'Neural Network Suite',
      capacity: 25,
      amenities: ['AI Demo Setup', 'Multiple Screens', 'Video Conferencing', 'Recording Equipment'],
      floor: '3rd Floor',
      address: '456 Silicon Valley Blvd, Building B, Room 301',
      description: 'Large conference room with AI presentation capabilities',
      parkId: techPark.id
    });

    // =====================
    // CREATIVE ARTS CENTER
    // =====================

    // Create companies for Creative Park
    const designStudio = CompanyModel.create({
      name: 'Pixel Perfect Design',
      address: '789 Arts District, Studio 100',
      parkId: creativePark.id
    });

    const mediaHouse = CompanyModel.create({
      name: 'Bright Media Productions',
      address: '789 Arts District, Studio 200',
      parkId: creativePark.id
    });

    // Create users for Creative Park
    await UserModel.create({
      email: 'parkadmin@creative.com',
      password: 'creative123',
      name: 'Creative Park Admin',
      role: UserRole.PARK_ADMIN,
      companyId: designStudio.id,
      parkId: creativePark.id
    });

    await UserModel.create({
      email: 'alex@pixelperfect.com',
      password: 'alex123',
      name: 'Alex Rivera',
      role: UserRole.COMPANY_ADMIN,
      companyId: designStudio.id,
      parkId: creativePark.id
    });

    await UserModel.create({
      email: 'emma@brightmedia.com',
      password: 'emma123',
      name: 'Emma Thompson',
      role: UserRole.USER,
      companyId: mediaHouse.id,
      parkId: creativePark.id
    });

    // Create meeting rooms for Creative Park
    RoomModel.create({
      name: 'Design Studio A',
      capacity: 8,
      amenities: ['Drawing Tablets', 'Large Monitor', 'Whiteboard', 'Color Calibrated Display'],
      floor: '1st Floor',
      address: '789 Arts District, Room 101',
      description: 'Creative workspace for design reviews and collaboration',
      parkId: creativePark.id
    });

    RoomModel.create({
      name: 'Screening Room',
      capacity: 20,
      amenities: ['4K Projector', 'Surround Sound', 'Blackout Curtains', 'Comfortable Seating'],
      floor: '2nd Floor',
      address: '789 Arts District, Room 201',
      description: 'Theater-style room for video reviews and presentations',
      parkId: creativePark.id
    });

    RoomModel.create({
      name: 'Green Room',
      capacity: 6,
      amenities: ['Makeup Station', 'Full Mirror', 'Comfortable Seating'],
      floor: '1st Floor',
      address: '789 Arts District, Room 105',
      description: 'Preparation room for talent and presenters',
      parkId: creativePark.id
    });

    res.json({
      success: true,
      message: 'Demo data created successfully with 3 parks',
      parks: [
        { name: 'Downtown Business Park', id: defaultParkId },
        { name: 'Tech Innovation Hub', id: techPark.id },
        { name: 'Creative Arts Center', id: creativePark.id }
      ],
      credentials: {
        superAdmin: { email: 'admin@openmeeting.com', password: 'admin123', description: 'Can manage all parks' },
        parkAdmin: { email: 'parkadmin@downtown.com', password: 'parkadmin123', description: 'Downtown Park admin' },
        companyAdmin: { email: 'admin@techcorp.com', password: 'techcorp123', description: 'TechCorp company admin' },
        user: { email: 'john@techcorp.com', password: 'john123', description: 'Regular user' }
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
