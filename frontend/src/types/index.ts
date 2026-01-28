export enum UserRole {
  ADMIN = 'admin',
  COMPANY_ADMIN = 'company_admin',
  USER = 'user'
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  companyId: string;
  createdAt?: string;
}

export interface Company {
  id: string;
  name: string;
  address: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface MeetingRoom {
  id: string;
  name: string;
  capacity: number;
  amenities: string[];
  floor: string;
  address: string;
  description: string;
  isActive: boolean;
  openingHour?: number | null;
  closingHour?: number | null;
  lockedToCompanyId?: string | null;
  lockedToCompany?: Company;
  createdAt?: string;
  updatedAt?: string;
}

export interface Settings {
  id: string;
  openingHour: number;
  closingHour: number;
  updatedAt?: string;
}

export interface Booking {
  id: string;
  roomId: string;
  userId: string;
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  attendees: string[];
  status: 'confirmed' | 'cancelled';
  room?: MeetingRoom;
  user?: User;
  createdAt?: string;
  updatedAt?: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface ApiError {
  error: string;
}

// Screen device types
export interface Device {
  id: string;
  name: string;
  token: string;
  roomId: string;
  isActive: boolean;
  lastSeenAt: string | null;
  room?: MeetingRoom;
  createdAt?: string;
  updatedAt?: string;
}
