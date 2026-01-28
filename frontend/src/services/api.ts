import { AuthResponse, User, Company, MeetingRoom, Booking, UserRole, Settings, Device } from '../types';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

class ApiService {
  private token: string | null = null;

  constructor() {
    this.token = localStorage.getItem('token');
  }

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('token', token);
    } else {
      localStorage.removeItem('token');
    }
  }

  getToken(): string | null {
    return this.token;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (this.token) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || 'Request failed');
    }

    if (response.status === 204) {
      return null as T;
    }

    return response.json();
  }

  // Setup
  async checkSetupStatus(): Promise<{ isSetup: boolean; hasUsers: boolean }> {
    return this.request('/setup/status');
  }

  // Settings
  async getSettings(): Promise<Settings> {
    return this.request<Settings>('/settings');
  }

  async updateSettings(data: { openingHour: number; closingHour: number }): Promise<Settings> {
    return this.request<Settings>('/settings', {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  // Auth
  async login(email: string, password: string): Promise<AuthResponse> {
    const response = await this.request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    this.setToken(response.token);
    return response;
  }

  async getCurrentUser(): Promise<User> {
    return this.request<User>('/auth/me');
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await this.request('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword })
    });
  }

  logout() {
    this.setToken(null);
  }

  // Companies
  async getCompanies(): Promise<Company[]> {
    return this.request<Company[]>('/companies');
  }

  async getCompany(id: string): Promise<Company> {
    return this.request<Company>(`/companies/${id}`);
  }

  async createCompany(data: { name: string; address: string }): Promise<Company> {
    return this.request<Company>('/companies', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async updateCompany(id: string, data: { name?: string; address?: string }): Promise<Company> {
    return this.request<Company>(`/companies/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async deleteCompany(id: string): Promise<void> {
    await this.request(`/companies/${id}`, { method: 'DELETE' });
  }

  // Users
  async getUsers(): Promise<User[]> {
    return this.request<User[]>('/users');
  }

  async getUsersByCompany(companyId: string): Promise<User[]> {
    return this.request<User[]>(`/users/company/${companyId}`);
  }

  async getUser(id: string): Promise<User> {
    return this.request<User>(`/users/${id}`);
  }

  async createUser(data: {
    email: string;
    password: string;
    name: string;
    role: UserRole;
    companyId: string;
  }): Promise<User> {
    return this.request<User>('/users', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async updateUser(id: string, data: {
    email?: string;
    name?: string;
    role?: UserRole;
    companyId?: string;
    password?: string;
  }): Promise<User> {
    return this.request<User>(`/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async deleteUser(id: string): Promise<void> {
    await this.request(`/users/${id}`, { method: 'DELETE' });
  }

  // Rooms
  async getRooms(includeInactive = false): Promise<MeetingRoom[]> {
    const query = includeInactive ? '?includeInactive=true' : '';
    return this.request<MeetingRoom[]>(`/rooms${query}`);
  }

  async getRoom(id: string): Promise<MeetingRoom> {
    return this.request<MeetingRoom>(`/rooms/${id}`);
  }

  async getRoomAvailability(id: string, startDate: string, endDate: string): Promise<{
    room: MeetingRoom;
    bookings: Array<{ id: string; title: string; startTime: string; endTime: string }>;
  }> {
    return this.request(`/rooms/${id}/availability?startDate=${startDate}&endDate=${endDate}`);
  }

  async createRoom(data: {
    name: string;
    capacity: number;
    amenities: string[];
    floor: string;
    address: string;
    description?: string;
    openingHour?: number | null;
    closingHour?: number | null;
    lockedToCompanyId?: string | null;
  }): Promise<MeetingRoom> {
    return this.request<MeetingRoom>('/rooms', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async updateRoom(id: string, data: {
    name?: string;
    capacity?: number;
    amenities?: string[];
    floor?: string;
    address?: string;
    description?: string;
    isActive?: boolean;
    openingHour?: number | null;
    closingHour?: number | null;
    lockedToCompanyId?: string | null;
  }): Promise<MeetingRoom> {
    return this.request<MeetingRoom>(`/rooms/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async deleteRoom(id: string, soft = true): Promise<void> {
    const query = soft ? '?soft=true' : '';
    await this.request(`/rooms/${id}${query}`, { method: 'DELETE' });
  }

  // Bookings
  async getBookings(startDate?: string, endDate?: string): Promise<Booking[]> {
    let query = '';
    if (startDate && endDate) {
      query = `?startDate=${startDate}&endDate=${endDate}`;
    }
    return this.request<Booking[]>(`/bookings${query}`);
  }

  async getMyBookings(): Promise<Booking[]> {
    return this.request<Booking[]>('/bookings/my');
  }

  async getBooking(id: string): Promise<Booking> {
    return this.request<Booking>(`/bookings/${id}`);
  }

  async createBooking(data: {
    roomId: string;
    title: string;
    description?: string;
    startTime: string;
    endTime: string;
    attendees?: string[];
  }): Promise<Booking> {
    return this.request<Booking>('/bookings', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async updateBooking(id: string, data: {
    title?: string;
    description?: string;
    startTime?: string;
    endTime?: string;
    attendees?: string[];
  }): Promise<Booking> {
    return this.request<Booking>(`/bookings/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async cancelBooking(id: string): Promise<void> {
    await this.request(`/bookings/${id}/cancel`, { method: 'POST' });
  }

  async deleteBooking(id: string): Promise<void> {
    await this.request(`/bookings/${id}`, { method: 'DELETE' });
  }

  // Devices
  async getDevices(includeInactive = false): Promise<Device[]> {
    const query = includeInactive ? '?includeInactive=true' : '';
    return this.request<Device[]>(`/devices${query}`);
  }

  async getDevice(id: string): Promise<Device> {
    return this.request<Device>(`/devices/${id}`);
  }

  async getDevicesByRoom(roomId: string): Promise<Device[]> {
    return this.request<Device[]>(`/devices/room/${roomId}`);
  }

  async createDevice(data: { name: string; roomId: string }): Promise<Device> {
    return this.request<Device>('/devices', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async updateDevice(id: string, data: {
    name?: string;
    roomId?: string;
    isActive?: boolean;
  }): Promise<Device> {
    return this.request<Device>(`/devices/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async regenerateDeviceToken(id: string): Promise<Device> {
    return this.request<Device>(`/devices/${id}/regenerate-token`, {
      method: 'POST'
    });
  }

  async deleteDevice(id: string): Promise<void> {
    await this.request(`/devices/${id}`, { method: 'DELETE' });
  }
}

export const api = new ApiService();
