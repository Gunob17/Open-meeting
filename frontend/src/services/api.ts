import { AuthResponse, User, Company, MeetingRoom, Booking, UserRole, Settings, Device, Park, Firmware, TwoFaSetupResponse, TwoFaStatusResponse, TrustedDeviceInfo, ExternalGuest, GuestVisit, LdapConfig, LdapSyncResult, SsoConfig, SsoDiscoveryResult } from '../types';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

class ApiService {
  private token: string | null = null;
  // Impersonation token (dev mode only) — overrides real token for API requests, not persisted
  private _impersonationToken: string | null = null;

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

  setImpersonationToken(token: string | null) {
    this._impersonationToken = token;
  }

  getImpersonationToken(): string | null {
    return this._impersonationToken;
  }

  // Returns all users without any park filter — for dev widget only, uses real token
  async devGetAllUsers(): Promise<User[]> {
    const realToken = this.token;
    const response = await fetch(`${API_BASE}/users`, {
      headers: {
        'Content-Type': 'application/json',
        ...(realToken ? { Authorization: `Bearer ${realToken}` } : {}),
      },
    });
    if (!response.ok) throw new Error('Failed to load users');
    return response.json();
  }

  // Returns a JWT for any user — only works when backend is in dev mode
  async devImpersonate(userId: string): Promise<{ token: string; user: User }> {
    // Always use the real token for this request (to prove we're authenticated as ourselves)
    const realToken = this.token;
    const response = await fetch(`${API_BASE}/dev/impersonate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(realToken ? { Authorization: `Bearer ${realToken}` } : {}),
      },
      body: JSON.stringify({ userId }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Impersonation failed' }));
      throw new Error(err.error || 'Impersonation failed');
    }
    return response.json();
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

    const activeToken = this._impersonationToken || this.token;
    if (activeToken) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${activeToken}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || 'Request failed');
    }

    this.updateLastActivity();

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

  // Keep me logged in / activity tracking
  getKeepLoggedIn(): boolean {
    return localStorage.getItem('keepLoggedIn') === 'true';
  }

  setKeepLoggedIn(keep: boolean) {
    if (keep) {
      localStorage.setItem('keepLoggedIn', 'true');
    } else {
      localStorage.removeItem('keepLoggedIn');
    }
  }

  private updateLastActivity() {
    localStorage.setItem('lastActivity', Date.now().toString());
  }

  isInactive(): boolean {
    const lastActivity = localStorage.getItem('lastActivity');
    if (!lastActivity) return false;
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    return Date.now() - parseInt(lastActivity, 10) > SEVEN_DAYS_MS;
  }

  // Device token management (for trusted device 2FA)
  getDeviceToken(): string | null {
    return localStorage.getItem('deviceToken');
  }

  setDeviceToken(token: string | null) {
    if (token) {
      localStorage.setItem('deviceToken', token);
    } else {
      localStorage.removeItem('deviceToken');
    }
  }

  // Auth
  async login(email: string, password: string, keepLoggedIn: boolean = false): Promise<AuthResponse> {
    const deviceToken = this.getDeviceToken();
    this.setKeepLoggedIn(keepLoggedIn);
    const response = await this.request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, deviceToken, keepLoggedIn })
    });
    this.setToken(response.token);
    if (response.deviceToken) {
      this.setDeviceToken(response.deviceToken);
    }
    return response;
  }

  async getCurrentUser(): Promise<User> {
    return this.request<User>('/auth/me');
  }

  async refreshToken(): Promise<void> {
    const response = await this.request<{ token: string }>('/auth/refresh', {
      method: 'POST'
    });
    this.setToken(response.token);
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await this.request('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword })
    });
  }

  logout() {
    this._impersonationToken = null;
    this.setToken(null);
    this.setKeepLoggedIn(false);
    localStorage.removeItem('lastActivity');
    // Note: do NOT clear deviceToken on logout — it persists across sessions
  }

  // 2FA
  async twofaSetup(): Promise<TwoFaSetupResponse> {
    return this.request<TwoFaSetupResponse>('/auth/2fa/setup', { method: 'POST' });
  }

  async twofaSetupConfirm(code: string): Promise<{
    message: string;
    backupCodes: string[];
    token?: string;
    user?: User;
  }> {
    const keepLoggedIn = this.getKeepLoggedIn();
    const response = await this.request<any>('/auth/2fa/setup/confirm', {
      method: 'POST',
      body: JSON.stringify({ code, keepLoggedIn })
    });
    if (response.token) {
      this.setToken(response.token);
    }
    return response;
  }

  async twofaVerify(code: string, trustDevice: boolean = false): Promise<AuthResponse> {
    const keepLoggedIn = this.getKeepLoggedIn();
    const response = await this.request<AuthResponse>('/auth/2fa/verify', {
      method: 'POST',
      body: JSON.stringify({ code, trustDevice, keepLoggedIn })
    });
    if (response.token) {
      this.setToken(response.token);
    }
    if (response.deviceToken) {
      this.setDeviceToken(response.deviceToken);
    }
    return response;
  }

  async twofaDisable(password: string): Promise<void> {
    await this.request('/auth/2fa/disable', {
      method: 'POST',
      body: JSON.stringify({ password })
    });
  }

  async twofaGetStatus(): Promise<TwoFaStatusResponse> {
    return this.request<TwoFaStatusResponse>('/auth/2fa/status');
  }

  async twofaGetTrustedDevices(): Promise<TrustedDeviceInfo[]> {
    return this.request<TrustedDeviceInfo[]>('/auth/2fa/trusted-devices');
  }

  async twofaRevokeTrustedDevice(id: string): Promise<void> {
    await this.request(`/auth/2fa/trusted-devices/${id}`, { method: 'DELETE' });
  }

  async resetUserTwoFa(userId: string): Promise<void> {
    await this.request(`/users/${userId}/reset-2fa`, { method: 'POST' });
  }

  async updateTwoFaSettings(data: {
    twofaEnforcement: string;
    twofaMode: string;
    twofaTrustedDeviceDays: number;
  }): Promise<Settings> {
    return this.request<Settings>('/settings/2fa', {
      method: 'PUT',
      body: JSON.stringify(data)
    });
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

  async updateCompany(id: string, data: { name?: string; address?: string; twofaEnforcement?: string }): Promise<Company> {
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
    role: UserRole;
    companyId: string;
    addonRoles?: string[];
  }): Promise<User> {
    return this.request<User>('/users', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async completeInvite(token: string, name: string, password: string): Promise<{ token: string; user: User }> {
    return this.request<{ token: string; user: User }>('/auth/complete-invite', {
      method: 'POST',
      body: JSON.stringify({ token, name, password })
    });
  }

  async updateUser(id: string, data: {
    email?: string;
    name?: string;
    role?: UserRole;
    companyId?: string;
    password?: string;
    addonRoles?: string[];
  }): Promise<User> {
    return this.request<User>(`/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async deleteUser(id: string): Promise<void> {
    await this.request(`/users/${id}`, { method: 'DELETE' });
  }

  async resendInvite(id: string): Promise<void> {
    await this.request(`/users/${id}/resend-invite`, { method: 'POST' });
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
    lockedToCompanyIds?: string[];
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
    lockedToCompanyIds?: string[];
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
    externalGuests?: ExternalGuest[];
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
    externalGuests?: ExternalGuest[];
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

  async updatePark(id: string, data: { name?: string; address?: string; description?: string; isActive?: boolean; twofaEnforcement?: string; receptionEmail?: string | null; receptionGuestFields?: string[] }): Promise<Park> {
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
        'Authorization': `Bearer ${this._impersonationToken || this.token}`
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

  async updateParkReception(parkId: string, data: { receptionEmail?: string | null; receptionGuestFields?: string[] }): Promise<Park> {
    return this.request<Park>(`/parks/${parkId}/reception`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  // Firmware
  async getFirmwareList(): Promise<Firmware[]> {
    return this.request<Firmware[]>('/firmware');
  }

  async getLatestFirmware(): Promise<Firmware> {
    return this.request<Firmware>('/firmware/latest');
  }

  async uploadFirmware(file: File, version: string, deviceType: string, releaseNotes?: string): Promise<Firmware> {
    const formData = new FormData();
    formData.append('firmware', file);
    formData.append('version', version);
    formData.append('deviceType', deviceType);
    if (releaseNotes) formData.append('releaseNotes', releaseNotes);

    const response = await fetch(`${API_BASE}/firmware`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this._impersonationToken || this.token}`
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

  // Statistics
  async getStatisticsSummary(parkId?: string): Promise<{
    today: { bookings: number };
    thisWeek: { bookings: number };
    thisMonth: { bookings: number };
    totals: { activeRooms: number; activeUsers: number };
  }> {
    const selectedPark = parkId || this.getSelectedParkId();
    const query = selectedPark ? `?parkId=${selectedPark}` : '';
    return this.request(`/statistics/summary${query}`);
  }

  async getRoomStatistics(startDate?: string, endDate?: string, parkId?: string): Promise<{
    dateRange: { start: string; end: string };
    rooms: Array<{
      roomId: string;
      roomName: string;
      floor: string;
      capacity: number;
      amenities: string[];
      totalBookings: number;
      totalHoursBooked: number;
      utilizationRate: number;
      averageBookingDuration: number;
      uniqueBookers: number;
      cancellationCount: number;
    }>;
    summary: {
      totalRooms: number;
      totalBookings: number;
      averageUtilization: number;
    };
  }> {
    const selectedPark = parkId || this.getSelectedParkId();
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    if (selectedPark) params.append('parkId', selectedPark);
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/statistics/rooms${query}`);
  }

  async getHourlyStatistics(startDate?: string, endDate?: string, parkId?: string): Promise<{
    dateRange: { start: string; end: string };
    hourlyStats: Array<{ hour: number; bookingCount: number }>;
    peakHour: number;
    peakHourBookings: number;
  }> {
    const selectedPark = parkId || this.getSelectedParkId();
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    if (selectedPark) params.append('parkId', selectedPark);
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/statistics/hourly${query}`);
  }

  async getDailyStatistics(startDate?: string, endDate?: string, parkId?: string): Promise<{
    dateRange: { start: string; end: string };
    dailyStats: Array<{ date: string; bookingCount: number; totalHours: number }>;
    averageBookingsPerDay: number;
  }> {
    const selectedPark = parkId || this.getSelectedParkId();
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    if (selectedPark) params.append('parkId', selectedPark);
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/statistics/daily${query}`);
  }

  async getAmenityStatistics(startDate?: string, endDate?: string, parkId?: string): Promise<{
    dateRange: { start: string; end: string };
    amenityStats: Array<{
      amenity: string;
      roomCount: number;
      totalBookings: number;
      averageUtilization: number;
    }>;
  }> {
    const selectedPark = parkId || this.getSelectedParkId();
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    if (selectedPark) params.append('parkId', selectedPark);
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/statistics/amenities${query}`);
  }

  async getTopBookers(startDate?: string, endDate?: string, parkId?: string, limit?: number): Promise<{
    dateRange: { start: string; end: string };
    topBookers: Array<{
      userId: string;
      companyName: string;
      bookingCount: number;
      totalHoursBooked: number;
    }>;
  }> {
    const selectedPark = parkId || this.getSelectedParkId();
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    if (selectedPark) params.append('parkId', selectedPark);
    if (limit) params.append('limit', limit.toString());
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/statistics/top-bookers${query}`);
  }
  // Receptionist
  async getReceptionistGuests(date?: string): Promise<{ date: string; guests: GuestVisit[]; closingHour: number }> {
    const params = new URLSearchParams();
    if (date) params.append('date', date);
    const selectedPark = this.getSelectedParkId();
    if (selectedPark) params.append('parkId', selectedPark);
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/receptionist/guests${query}`);
  }

  async checkInGuest(visitId: string): Promise<GuestVisit> {
    return this.request<GuestVisit>(`/receptionist/guests/${visitId}/checkin`, { method: 'POST' });
  }

  async checkOutGuest(visitId: string): Promise<GuestVisit> {
    return this.request<GuestVisit>(`/receptionist/guests/${visitId}/checkout`, { method: 'POST' });
  }

  async undoCheckInGuest(visitId: string): Promise<GuestVisit> {
    return this.request<GuestVisit>(`/receptionist/guests/${visitId}/undo-checkin`, { method: 'POST' });
  }

  // LDAP
  async getLdapConfig(companyId: string): Promise<LdapConfig | null> {
    try {
      return await this.request<LdapConfig>(`/ldap/config/${companyId}`);
    } catch {
      return null;
    }
  }

  async createLdapConfig(data: {
    companyId: string;
    serverUrl: string;
    bindDn: string;
    bindPassword: string;
    searchBase: string;
    userFilter?: string;
    usernameAttribute?: string;
    emailAttribute?: string;
    nameAttribute?: string;
    groupSearchBase?: string;
    groupFilter?: string;
    groupMemberAttribute?: string;
    roleMappings?: { ldapGroupDn: string; appRole: string }[];
    defaultRole?: string;
    syncIntervalHours?: number;
    useStarttls?: boolean;
    tlsRejectUnauthorized?: boolean;
    connectionTimeoutMs?: number;
  }): Promise<LdapConfig> {
    return this.request<LdapConfig>('/ldap/config', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateLdapConfig(id: string, data: Record<string, any>): Promise<LdapConfig> {
    return this.request<LdapConfig>(`/ldap/config/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteLdapConfig(id: string): Promise<void> {
    await this.request(`/ldap/config/${id}`, { method: 'DELETE' });
  }

  async enableLdap(configId: string): Promise<LdapConfig> {
    return this.request<LdapConfig>(`/ldap/config/${configId}/enable`, { method: 'POST' });
  }

  async disableLdap(configId: string): Promise<LdapConfig> {
    return this.request<LdapConfig>(`/ldap/config/${configId}/disable`, { method: 'POST' });
  }

  async testLdapConnection(configId: string): Promise<{ success: boolean; message: string; userCount?: number }> {
    return this.request(`/ldap/config/${configId}/test`, { method: 'POST' });
  }

  async syncLdap(configId: string): Promise<LdapSyncResult> {
    return this.request<LdapSyncResult>(`/ldap/config/${configId}/sync`, { method: 'POST' });
  }

  async getLdapSyncStatus(configId: string): Promise<{
    lastSyncAt: string | null;
    lastSyncStatus: string | null;
    lastSyncMessage: string | null;
    lastSyncUserCount: number | null;
  }> {
    return this.request(`/ldap/config/${configId}/sync-status`);
  }

  // SSO
  async discoverSso(email: string): Promise<SsoDiscoveryResult> {
    return this.request<SsoDiscoveryResult>(`/sso/discover?email=${encodeURIComponent(email)}`);
  }

  async getSsoConfig(companyId: string): Promise<SsoConfig | null> {
    try {
      return await this.request<SsoConfig>(`/sso/config/${companyId}`);
    } catch {
      return null;
    }
  }

  async createSsoConfig(data: {
    companyId: string;
    protocol: string;
    displayName?: string;
    oidcIssuerUrl?: string;
    oidcClientId?: string;
    oidcClientSecret?: string;
    oidcScopes?: string;
    samlEntryPoint?: string;
    samlIssuer?: string;
    samlCert?: string;
    samlCallbackUrl?: string;
    autoCreateUsers?: boolean;
    defaultRole?: string;
    emailDomains?: string[];
  }): Promise<SsoConfig> {
    return this.request<SsoConfig>('/sso/config', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateSsoConfig(id: string, data: Record<string, any>): Promise<SsoConfig> {
    return this.request<SsoConfig>(`/sso/config/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteSsoConfig(id: string): Promise<void> {
    await this.request(`/sso/config/${id}`, { method: 'DELETE' });
  }

  async enableSso(configId: string): Promise<SsoConfig> {
    return this.request<SsoConfig>(`/sso/config/${configId}/enable`, { method: 'POST' });
  }

  async disableSso(configId: string): Promise<SsoConfig> {
    return this.request<SsoConfig>(`/sso/config/${configId}/disable`, { method: 'POST' });
  }
}

export const api = new ApiService();
