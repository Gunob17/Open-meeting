import { initializeDatabase } from './models/database';
import { CompanyModel } from './models/company.model';
import { UserModel } from './models/user.model';
import { RoomModel } from './models/room.model';
import { UserRole } from './types';

async function seed() {
  console.log('Initializing database...');
  initializeDatabase();

  console.log('Creating seed data...');

  // Create companies
  const sharedOffice = CompanyModel.create({
    name: 'Shared Office Management',
    address: '123 Business Center, Suite 100, New York, NY 10001'
  });

  const techCorp = CompanyModel.create({
    name: 'TechCorp Inc.',
    address: '456 Innovation Drive, San Francisco, CA 94105'
  });

  const startupHub = CompanyModel.create({
    name: 'StartupHub',
    address: '789 Entrepreneur Way, Austin, TX 78701'
  });

  console.log('Created companies:', sharedOffice.name, techCorp.name, startupHub.name);

  // Create admin user
  const admin = await UserModel.create({
    email: 'admin@sharedoffice.com',
    password: 'admin123',
    name: 'System Administrator',
    role: UserRole.ADMIN,
    companyId: sharedOffice.id
  });
  console.log('Created admin:', admin.email);

  // Create company admin for TechCorp
  const techCorpAdmin = await UserModel.create({
    email: 'admin@techcorp.com',
    password: 'techcorp123',
    name: 'TechCorp Admin',
    role: UserRole.COMPANY_ADMIN,
    companyId: techCorp.id
  });
  console.log('Created company admin:', techCorpAdmin.email);

  // Create company admin for StartupHub
  const startupAdmin = await UserModel.create({
    email: 'admin@startuphub.com',
    password: 'startup123',
    name: 'StartupHub Admin',
    role: UserRole.COMPANY_ADMIN,
    companyId: startupHub.id
  });
  console.log('Created company admin:', startupAdmin.email);

  // Create regular users
  const user1 = await UserModel.create({
    email: 'john@techcorp.com',
    password: 'john123',
    name: 'John Smith',
    role: UserRole.USER,
    companyId: techCorp.id
  });

  const user2 = await UserModel.create({
    email: 'jane@techcorp.com',
    password: 'jane123',
    name: 'Jane Doe',
    role: UserRole.USER,
    companyId: techCorp.id
  });

  const user3 = await UserModel.create({
    email: 'bob@startuphub.com',
    password: 'bob123',
    name: 'Bob Wilson',
    role: UserRole.USER,
    companyId: startupHub.id
  });

  console.log('Created users:', user1.name, user2.name, user3.name);

  // Create meeting rooms
  const room1 = RoomModel.create({
    name: 'Innovation Lab',
    capacity: 20,
    amenities: ['Projector', 'Whiteboard', 'Video Conferencing', 'Air Conditioning'],
    floor: '3rd Floor',
    address: '123 Business Center, Suite 100, Room 301, New York, NY 10001',
    description: 'Large meeting room ideal for workshops and presentations'
  });

  const room2 = RoomModel.create({
    name: 'Brainstorm Studio',
    capacity: 8,
    amenities: ['Whiteboard', 'TV Screen', 'Standing Desk'],
    floor: '2nd Floor',
    address: '123 Business Center, Suite 100, Room 205, New York, NY 10001',
    description: 'Creative space for team brainstorming sessions'
  });

  const room3 = RoomModel.create({
    name: 'Executive Boardroom',
    capacity: 12,
    amenities: ['Video Conferencing', 'Projector', 'Conference Phone', 'Catering Service'],
    floor: '4th Floor',
    address: '123 Business Center, Suite 100, Room 401, New York, NY 10001',
    description: 'Premium meeting room for executive meetings and client presentations'
  });

  const room4 = RoomModel.create({
    name: 'Focus Pod A',
    capacity: 4,
    amenities: ['TV Screen', 'Whiteboard'],
    floor: '1st Floor',
    address: '123 Business Center, Suite 100, Room 102, New York, NY 10001',
    description: 'Small meeting pod for quick discussions'
  });

  const room5 = RoomModel.create({
    name: 'Focus Pod B',
    capacity: 4,
    amenities: ['TV Screen', 'Whiteboard'],
    floor: '1st Floor',
    address: '123 Business Center, Suite 100, Room 103, New York, NY 10001',
    description: 'Small meeting pod for quick discussions'
  });

  const room6 = RoomModel.create({
    name: 'Training Center',
    capacity: 30,
    amenities: ['Projector', 'Multiple Screens', 'Microphones', 'Recording Equipment', 'Air Conditioning'],
    floor: '5th Floor',
    address: '123 Business Center, Suite 100, Room 501, New York, NY 10001',
    description: 'Large training room for seminars and workshops'
  });

  console.log('Created rooms:', room1.name, room2.name, room3.name, room4.name, room5.name, room6.name);

  console.log('\n=== Seed data created successfully! ===\n');
  console.log('Login credentials:');
  console.log('------------------');
  console.log('Admin:         admin@sharedoffice.com / admin123');
  console.log('Company Admin: admin@techcorp.com / techcorp123');
  console.log('Company Admin: admin@startuphub.com / startup123');
  console.log('User:          john@techcorp.com / john123');
  console.log('User:          jane@techcorp.com / jane123');
  console.log('User:          bob@startuphub.com / bob123');
}

seed().catch(console.error);
