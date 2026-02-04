import { AuthResponse, User, Company, MeetingRoom, Booking, UserRole, Settings, Device, Park, Firmware } from '../types';

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

  getSelectedParkId(): string | null {
    return localStorage.getItem('selectedParkId');
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
  async getCompanies(parkId?: string): Promise<Company[]> {
    const selectedPark = parkId || this.getSelectedParkId();
    const query = selectedPark ? `?parkId=${selectedPark}` : '';
    return this.request<Company[]>(`/companies${query}`);
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
  async getUsers(parkId?: string): Promise<User[]> {
    const selectedPark = parkId || this.getSelectedParkId();
    const query = selectedPark ? `?parkId=${selectedPark}` : '';
    return this.request<User[]>(`/users${query}`);
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
  async getRooms(includeInactive = false, parkId?: string): Promise<MeetingRoom[]> {
    const selectedPark = parkId || this.getSelectedParkId();
    const params = new URLSearchParams();
    if (includeInactive) params.append('includeInactive', 'true');
    if (selectedPark) params.append('parkId', selectedPark);
    const query = params.toString() ? `?${params.toString()}` : '';
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

  async deleteBooking(id: string, reason?: string): Promise<void> {
    await this.request(`/bookings/${id}`, {
      method: 'DELETE',
      body: JSON.stringify({ reason })
    });
  }

  async moveBooking(id: string, newRoomId: string, reason?: string): Promise<Booking> {
    return this.request<Booking>(`/bookings/${id}/move`, {
      method: 'POST',
      body: JSON.stringify({ newRoomId, reason })
    });
  }

  // Devices
  async getDevices(includeInactive = false, parkId?: string): Promise<Device[]> {
    const selectedPark = parkId || this.getSelectedParkId();
    const params = new URLSearchParams();
    if (includeInactive) params.append('includeInactive', 'true');
    if (selectedPark) params.append('parkId', selectedPark);
    const query = params.toString() ? `?${params.toString()}` : '';
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

  // Parks
  async getParks(includeInactive = false): Promise<Park[]> {
    const query = includeInactive ? '?includeInactive=true' : '';
    return this.request<Park[]>(`/parks${query}`);
  }

  async getPark(id: string): Promise<Park> {
    return this.request<Park>(`/parks/${id}`);
  }

  async createPark(data: { name: string; address: string; description?: string }): Promise<Park> {
    return this.request<Park>('/parks', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async updatePark(id: string, data: { name?: string; address?: string; description?: string; isActive?: boolean }): Promise<Park> {
    return this.request<Park>(`/parks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async deletePark(id: string, soft = true): Promise<void> {
    const query = soft ? '?soft=true' : '';
    await this.request(`/parks/${id}${query}`, { method: 'DELETE' });
  }

  async uploadParkLogo(parkId: string, file: File): Promise<Park> {
    const formData = new FormData();
    formData.append('logo', file);

    const response = await fetch(`${API_BASE}/parks/${parkId}/logo`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`
      },
      body: formData
    });

    if (!response.ok) {
      const text = await response.text();
      let error;
      try {
        error = JSON.parse(text);
      } catch {
        error = { error: text || 'Upload failed' };
      }
      throw new Error(error.error || 'Upload failed');
    }

    return response.json();
  }

  async deleteParkLogo(parkId: string): Promise<Park> {
    return this.request<Park>(`/parks/${parkId}/logo`, { method: 'DELETE' });
  }

  // Firmware
  async getFirmwareList(): Promise<Firmware[]> {
    return this.request<Firmware[]>('/firmware');
  }

  async getLatestFirmware(): Promise<Firmware> {
    return this.request<Firmware>('/firmware/latest');
  }

  async uploadFirmware(file: File, version: string, releaseNotes?: string): Promise<Firmware> {
    const formData = new FormData();
    formData.append('firmware', file);
    formData.append('version', version);
    if (releaseNotes) formData.append('releaseNotes', releaseNotes);

    console.log('Uploading firmware:', { filename: file.name, size: file.size, version });

    const response = await fetch(`${API_BASE}/firmware`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`
      },
      body: formData
    });

    console.log('Upload response status:', response.status);

    if (!response.ok) {
      const text = await response.text();
      console.error('Upload error response:', text);
      let error;
      try {
        error = JSON.parse(text);
      } catch {
        error = { error: text || 'Upload failed' };
      }
      throw new Error(error.error || 'Upload failed');
    }

    return response.json();
  }

  async deleteFirmware(id: string): Promise<void> {
    await this.request(`/firmware/${id}`, { method: 'DELETE' });
  }

  async toggleFirmwareActive(id: string, isActive: boolean): Promise<Firmware> {
    return this.request<Firmware>(`/firmware/${id}/active`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive })
    });
  }

  // Schedule firmware update for devices
  async scheduleFirmwareUpdate(deviceIds: string[], firmwareVersion: string): Promise<{
    success: boolean;
    message: string;
    updatedCount: number;
    firmwareVersion: string;
  }> {
    return this.request('/devices/firmware/schedule-update', {
      method: 'POST',
      body: JSON.stringify({ deviceIds, firmwareVersion })
    });
  }

  async cancelFirmwareUpdate(deviceId: string): Promise<Device> {
    return this.request<Device>(`/devices/${deviceId}/firmware/cancel-update`, {
      method: 'POST'
    });
  }
}

export const api = new ApiService();
