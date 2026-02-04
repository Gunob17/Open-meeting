export enum UserRole {
  SUPER_ADMIN = 'super_admin',
  PARK_ADMIN = 'park_admin',
  COMPANY_ADMIN = 'company_admin',
  USER = 'user'
}

export interface Park {
  id: string;
  name: string;
  address: string;
  description: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  companyId: string;
  parkId?: string | null;
  createdAt?: string;
}

export interface Company {
  id: string;
  name: string;
  address: string;
  parkId: string;
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
  parkId: string;
  openingHour?: number | null;
  closingHour?: number | null;
  lockedToCompanyId?: string | null;
  lockedToCompany?: Company;
  quickBookDurations?: number[]; // Available quick booking durations in minutes for device
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
  firmwareVersion: string | null;
  hasUpdate?: boolean;
  latestVersion?: string | null;
  room?: MeetingRoom;
  createdAt?: string;
  updatedAt?: string;
}

// Firmware types for OTA updates
export interface Firmware {
  id: string;
  version: string;
  filename: string;
  size: number;
  checksum: string;
  releaseNotes: string;
  isActive: boolean;
  createdAt: string;
}
