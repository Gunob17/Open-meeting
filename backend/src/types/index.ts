export enum UserRole {
  ADMIN = 'admin',           // System administrator - can manage rooms and all users
  COMPANY_ADMIN = 'company_admin', // Company administrator - can manage users in their company
  USER = 'user'              // Regular user - can book meeting rooms
}

export interface User {
  id: string;
  email: string;
  password: string;
  name: string;
  role: UserRole;
  companyId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Company {
  id: string;
  name: string;
  address: string;
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
}

export interface CreateRoomRequest {
  name: string;
  capacity: number;
  amenities: string[];
  floor: string;
  address: string;
  description?: string;
  openingHour?: number | null;
  closingHour?: number | null;
  lockedToCompanyId?: string | null;
  quickBookDurations?: number[]; // Quick booking durations in minutes
}

export interface CreateCompanyRequest {
  name: string;
  address: string;
}

// Screen device types
export interface Device {
  id: string;
  name: string;
  token: string;
  roomId: string;
  isActive: boolean;
  lastSeenAt: string | null;
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
