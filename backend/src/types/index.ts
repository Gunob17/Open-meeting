export enum UserRole {
  SUPER_ADMIN = 'super_admin',     // Super administrator - can manage multiple parks
  PARK_ADMIN = 'park_admin',       // Park administrator - can manage rooms and users within their park
  COMPANY_ADMIN = 'company_admin', // Company administrator - can manage users in their company
  USER = 'user'                    // Regular user - can book meeting rooms
}

export interface Park {
  id: string;
  name: string;
  address: string;
  description: string;
  logoUrl: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  email: string;
  password: string;
  name: string;
  role: UserRole;
  companyId: string;
  parkId: string | null;  // null for super_admin who can access all parks
  createdAt: string;
  updatedAt: string;
}

export interface Company {
  id: string;
  name: string;
  address: string;
  parkId: string;
  createdAt: string;
  updatedAt: string;
}

export interface MeetingRoom {
  id: string;
  name: string;
  capacity: number;
  amenities: string; // JSON array stored as string
  floor: string;
  address: string;
  description: string;
  isActive: boolean;
  parkId: string;
  openingHour: number | null;  // Room-specific opening hour (null = use global)
  closingHour: number | null;  // Room-specific closing hour (null = use global)
  lockedToCompanyId: string | null; // If set, only this company can book
  quickBookDurations: number[]; // Available quick booking durations in minutes (e.g., [30, 60, 90, 120])
  createdAt: string;
  updatedAt: string;
}

export interface Settings {
  id: string;
  openingHour: number;
  closingHour: number;
  updatedAt: string;
}

export interface Booking {
  id: string;
  roomId: string;
  userId: string;
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  attendees: string; // JSON array of email addresses stored as string
  status: BookingStatus;
  createdAt: string;
  updatedAt: string;
}

export enum BookingStatus {
  CONFIRMED = 'confirmed',
  CANCELLED = 'cancelled'
}

export interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
  companyId: string;
  parkId: string | null;
}

export interface BookingWithDetails extends Booking {
  room?: MeetingRoom;
  user?: Omit<User, 'password'>;
}

export interface CreateBookingRequest {
  roomId: string;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  attendees?: string[];
}

export interface CreateUserRequest {
  email: string;
  password: string;
  name: string;
  role: UserRole;
  companyId: string;
  parkId?: string | null;
}

export interface CreateRoomRequest {
  name: string;
  capacity: number;
  amenities: string[];
  floor: string;
  address: string;
  description?: string;
  parkId: string;
  openingHour?: number | null;
  closingHour?: number | null;
  lockedToCompanyId?: string | null;
  quickBookDurations?: number[]; // Quick booking durations in minutes
}

export interface CreateCompanyRequest {
  name: string;
  address: string;
  parkId: string;
}

export interface CreateParkRequest {
  name: string;
  address: string;
  description?: string;
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
  pendingFirmwareVersion: string | null;  // Version to be installed on next check-in
  createdAt: string;
  updatedAt: string;
}

export interface DeviceWithRoom extends Device {
  room?: MeetingRoom;
}

export interface CreateDeviceRequest {
  name: string;
  roomId: string;
}

export interface DeviceRoomStatus {
  room: MeetingRoom;
  currentBooking: BookingWithDetails | null;
  upcomingBookings: BookingWithDetails[];
  isAvailable: boolean;
}

export interface DeviceQuickBookingRequest {
  title: string;
  durationMinutes: number; // Quick booking duration (e.g., 15, 30, 60 minutes)
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

export interface CreateFirmwareRequest {
  version: string;
  releaseNotes?: string;
}

export interface OtaUpdateCheck {
  updateAvailable: boolean;
  currentVersion: string | null;
  latestVersion: string | null;
  latestFirmware?: Firmware;
}
