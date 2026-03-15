import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { Company, Desk, DeskQuotaType, ParkDeskQuota, User, UserDeskQuota } from '../types';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';

type Tab = 'desks' | 'quota' | 'access';

const COMMON_DESK_FEATURES = [
  'Standing Desk', 'Dual Monitor', 'Window View', 'Quiet Zone',
  'Phone', 'External Display', 'Locker', 'Accessible', 'Ergonomic Chair', 'Natural Light',
];

type DeskFormData = { name: string; description: string; floor: string; features: string[] };
const DEFAULT_DESK_FORM: DeskFormData = { name: '', description: '', floor: '', features: [] };

const tabClass = (active: boolean) =>
  `tab-btn${active ? ' tab-btn--active' : ''}`;

export function AdminDesksPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const showConfirm = useConfirm();
  const parkId = api.getSelectedParkId() || user?.parkId || 'default';

  const getTabFromSearch = (): Tab => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('tab');
    if (t === 'quota') return 'quota';
    if (t === 'access') return 'access';
    return 'desks';
  };
  const [activeTab, setActiveTab] = useState<Tab>(getTabFromSearch);

  const switchTab = (tab: Tab) => {
    setActiveTab(tab);
    navigate(`/admin/desks?tab=${tab}`, { replace: true });
  };

  // Desks
  const [desks, setDesks] = useState<Desk[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingDesk, setEditingDesk] = useState<Desk | null>(null);
  const [deskForm, setDeskForm] = useState<DeskFormData>(DEFAULT_DESK_FORM);
  const [deskError, setDeskError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Park quota
  const [parkQuota, setParkQuota] = useState<ParkDeskQuota | null>(null);
  const [quotaType, setQuotaType] = useState<DeskQuotaType | ''>('');
  const [monthlyLimit, setMonthlyLimit] = useState('');
  const [savingQuota, setSavingQuota] = useState(false);
  const [quotaError, setQuotaError] = useState('');
  const [quotaSuccess, setQuotaSuccess] = useState('');

  // Company access
  const [companies, setCompanies] = useState<Company[]>([]);
  const [togglingCompanyId, setTogglingCompanyId] = useState<string | null>(null);
  const [companyAccessError, setCompanyAccessError] = useState('');

  // User overrides
  const [parkUsers, setParkUsers] = useState<User[]>([]);
  const [overrideUserId, setOverrideUserId] = useState('');
  const [overrideQuota, setOverrideQuota] = useState('');
  const [savingOverride, setSavingOverride] = useState(false);
  const [overrideError, setOverrideError] = useState('');
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const [showUserDropdown, setShowUserDropdown] = useState(false);

  useEffect(() => {
    loadAll();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadAll = async () => {
    setLoading(true);
    try {
      const [desksData, quotaData, usersData, companiesData] = await Promise.all([
        api.getDesks(true),
        api.getParkDeskQuota(parkId),
        api.getUsers(),
        api.getCompanies(),
      ]);
      setDesks(desksData);
      setParkQuota(quotaData);
      setQuotaType(quotaData.deskQuotaType ?? '');
      setMonthlyLimit(quotaData.monthlyDeskQuota !== null ? String(quotaData.monthlyDeskQuota) : '');
      setParkUsers(usersData.filter((u) => u.isActive));
      setCompanies(companiesData);
    } catch {
      setDeskError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  // ─── Desk CRUD ────────────────────────────────────────────────────────────
  const openCreate = () => {
    setEditingDesk(null);
    setDeskForm(DEFAULT_DESK_FORM);
    setDeskError('');
    setShowModal(true);
  };

  const openEdit = (desk: Desk) => {
    setEditingDesk(desk);
    setDeskForm({ name: desk.name, description: desk.description ?? '', floor: desk.floor ?? '', features: desk.features ?? [] });
    setDeskError('');
    setShowModal(true);
  };

  const closeModal = () => { setShowModal(false); setEditingDesk(null); setDeskError(''); };

  const handleDeskFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setDeskForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleFeatureToggle = (feature: string) => {
    setDeskForm((prev) => ({
      ...prev,
      features: prev.features.includes(feature)
        ? prev.features.filter((f) => f !== feature)
        : [...prev.features, feature],
    }));
  };

  const handleDeskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeskError('');
    setSaving(true);
    const payload = {
      name: deskForm.name.trim(),
      description: deskForm.description.trim() || null,
      floor: deskForm.floor.trim() || null,
      features: deskForm.features,
    };
    try {
      if (editingDesk) {
        await api.updateDesk(editingDesk.id, payload);
      } else {
        await api.createDesk(payload);
      }
      closeModal();
      const updated = await api.getDesks(true);
      setDesks(updated);
    } catch (err: any) {
      setDeskError(err.message || 'Failed to save desk');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (desk: Desk) => {
    try {
      await api.updateDesk(desk.id, { isActive: !desk.isActive });
      setDesks(await api.getDesks(true));
    } catch (err: any) {
      setDeskError(err.message || 'Failed to update desk');
    }
  };

  const handleDelete = async (desk: Desk) => {
    if (!await showConfirm({ message: `Delete desk "${desk.name}"? This will also remove all its bookings.`, title: 'Delete Desk', confirmLabel: 'Delete' })) return;
    setDeletingId(desk.id);
    try {
      await api.deleteDesk(desk.id);
      setDesks(await api.getDesks(true));
    } catch (err: any) {
      setDeskError(err.message || 'Failed to delete desk');
    } finally {
      setDeletingId(null);
    }
  };

  // ─── Park quota ───────────────────────────────────────────────────────────
  const handleSaveQuota = async (e: React.FormEvent) => {
    e.preventDefault();
    setQuotaError('');
    setQuotaSuccess('');

    const type = quotaType || null;
    const limit = type && monthlyLimit ? parseInt(monthlyLimit, 10) : null;

    if (type && (!monthlyLimit || isNaN(limit!) || limit! < 1)) {
      setQuotaError('Monthly limit must be a positive number when a quota type is selected');
      return;
    }

    setSavingQuota(true);
    try {
      await api.updateParkDeskQuota(parkId, type, limit);
      const updated = await api.getParkDeskQuota(parkId);
      setParkQuota(updated);
      setQuotaType(updated.deskQuotaType ?? '');
      setMonthlyLimit(updated.monthlyDeskQuota !== null ? String(updated.monthlyDeskQuota) : '');
      setQuotaSuccess('Quota settings saved');
      setTimeout(() => setQuotaSuccess(''), 3000);
    } catch (err: any) {
      setQuotaError(err.message || 'Failed to save quota settings');
    } finally {
      setSavingQuota(false);
    }
  };

  // ─── User overrides ───────────────────────────────────────────────────────
  const companyMap = new Map(companies.map((c) => [c.id, c]));
  const overrides: UserDeskQuota[] = parkQuota?.overrides ?? [];
  const overriddenUserIds = new Set(overrides.map((o) => o.userId));
  const availableUsers = parkUsers.filter((u) => !overriddenUserIds.has(u.id));
  const filteredUsers = userSearch.trim()
    ? availableUsers.filter((u) => {
        const q = userSearch.toLowerCase();
        const companyName = companyMap.get(u.companyId)?.name ?? '';
        return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || companyName.toLowerCase().includes(q);
      })
    : availableUsers;

  const handleAddOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    setOverrideError('');
    if (!overrideUserId) return;

    const q = parseInt(overrideQuota, 10);
    if (!overrideQuota || isNaN(q) || q < 1) {
      setOverrideError('Monthly limit must be a positive number');
      return;
    }
    setSavingOverride(true);
    try {
      await api.setParkDeskQuotaUser(parkId, overrideUserId, q);
      const updated = await api.getParkDeskQuota(parkId);
      setParkQuota(updated);
      setOverrideQuota('');
      setOverrideUserId('');
      setUserSearch('');
      setShowUserDropdown(false);
    } catch (err: any) {
      setOverrideError(err.message || 'Failed to set override');
    } finally {
      setSavingOverride(false);
    }
  };

  const handleRemoveOverride = async (userId: string) => {
    setRemovingUserId(userId);
    try {
      await api.deleteParkDeskQuotaUser(parkId, userId);
      const updated = await api.getParkDeskQuota(parkId);
      setParkQuota(updated);
    } catch (err: any) {
      setOverrideError(err.message || 'Failed to remove override');
    } finally {
      setRemovingUserId(null);
    }
  };

  // ─── Company access ───────────────────────────────────────────────────────
  const handleToggleCompanyAccess = async (company: Company) => {
    setCompanyAccessError('');
    setTogglingCompanyId(company.id);
    try {
      await api.updateCompany(company.id, { deskBookingEnabled: !company.deskBookingEnabled });
      setCompanies(await api.getCompanies());
    } catch (err: any) {
      setCompanyAccessError(err.message || 'Failed to update company access');
    } finally {
      setTogglingCompanyId(null);
    }
  };

  if (loading) return <div className="loading">Loading desks...</div>;

  return (
    <div className="admin-rooms-page">
      <div className="page-header">
        <h1>Manage Hot Desks</h1>
        {activeTab === 'desks' && (
          <button className="btn btn-primary" onClick={openCreate}>Add Desk</button>
        )}
      </div>

      {/* Tab navigation */}
      <div className="tab-nav">
        <button className={tabClass(activeTab === 'desks')} onClick={() => switchTab('desks')}>
          Desks
        </button>
        <button className={tabClass(activeTab === 'quota')} onClick={() => switchTab('quota')}>
          Quota
        </button>
        <button className={tabClass(activeTab === 'access')} onClick={() => switchTab('access')}>
          Company Access
        </button>
      </div>

      {/* ─── Desks tab ─── */}
      {activeTab === 'desks' && (
        <>
          {deskError && <div className="alert alert-error">{deskError}</div>}
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Floor / Location</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {desks.length === 0 ? (
                  <tr>
                    <td colSpan={4}>
                      <div className="empty-state">
                        <p>No desks configured yet. Add your first hot desk to get started.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  desks.map((desk) => (
                    <tr key={desk.id} className={!desk.isActive ? 'inactive' : ''}>
                      <td>
                        <div>{desk.name}</div>
                        {desk.description && (
                          <div style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: '2px' }}>
                            {desk.description}
                          </div>
                        )}
                        {desk.features && desk.features.length > 0 && (
                          <div style={{ marginTop: '3px', display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                            {desk.features.slice(0, 3).map((f) => (
                              <span key={f} className="amenity-tag small">{f}</span>
                            ))}
                            {desk.features.length > 3 && (
                              <span className="amenity-tag small">+{desk.features.length - 3} more</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td>{desk.floor || '—'}</td>
                      <td>
                        <span className={`status-badge ${desk.isActive ? 'active' : 'inactive'}`}>
                          {desk.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        <div className="room-actions">
                          <button className="btn btn-small btn-secondary" onClick={() => openEdit(desk)}>Edit</button>
                          <button
                            className={`btn btn-small ${desk.isActive ? 'btn-warning' : 'btn-success'}`}
                            onClick={() => handleToggleActive(desk)}
                          >
                            {desk.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                          <button
                            className="btn btn-small btn-danger"
                            onClick={() => handleDelete(desk)}
                            disabled={deletingId === desk.id}
                          >
                            {deletingId === desk.id ? 'Deleting...' : 'Delete'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ─── Quota tab ─── */}
      {activeTab === 'quota' && (
        <>
          <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
            Monthly limit on desk-days a user can book across all desks in this park.
          </p>

          {quotaError && <div className="alert alert-error">{quotaError}</div>}
          {quotaSuccess && <div className="alert alert-success">{quotaSuccess}</div>}

          <form onSubmit={handleSaveQuota}>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div className="form-group" style={{ marginBottom: 0, minWidth: '220px' }}>
                <label htmlFor="quotaType">Quota Type</label>
                <select
                  id="quotaType"
                  value={quotaType}
                  onChange={(e) => {
                    setQuotaType(e.target.value as DeskQuotaType | '');
                    if (!e.target.value) setMonthlyLimit('');
                  }}
                >
                  <option value="">Unlimited (no quota)</option>
                  <option value="per_user">Per User — each user has their own monthly limit</option>
                  <option value="per_company">Per Company — all users in a company share a limit</option>
                </select>
              </div>

              {quotaType && (
                <div className="form-group" style={{ marginBottom: 0, width: '140px' }}>
                  <label htmlFor="monthlyLimit">Days per Month</label>
                  <input
                    id="monthlyLimit"
                    type="number"
                    min={1}
                    max={31}
                    value={monthlyLimit}
                    onChange={(e) => setMonthlyLimit(e.target.value)}
                    placeholder="e.g. 10"
                    required
                  />
                </div>
              )}

              <button type="submit" className="btn btn-primary" disabled={savingQuota} style={{ marginBottom: '1px' }}>
                {savingQuota ? 'Saving...' : 'Save Quota'}
              </button>
            </div>
          </form>

          {/* User exceptions — only shown when quota type is per_user */}
          {parkQuota?.deskQuotaType === 'per_user' && (
            <div style={{ marginTop: '2rem', borderTop: '1px solid #e5e7eb', paddingTop: '1.5rem' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.2rem' }}>User Exceptions</h2>
              <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1rem' }}>
                Give specific users a different monthly limit than the default above.
              </p>

              {overrideError && <div className="alert alert-error">{overrideError}</div>}

              {overrides.length > 0 && (
                <table className="data-table" style={{ marginBottom: '1.25rem' }}>
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Monthly Limit</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {overrides.map((o) => (
                      <tr key={o.userId}>
                        <td>
                          <div>{o.user?.name ?? o.userId}</div>
                          {o.user?.email && (
                            <div style={{ fontSize: '0.78rem', color: '#6b7280' }}>{o.user.email}</div>
                          )}
                        </td>
                        <td>{o.monthlyQuota} day{o.monthlyQuota !== 1 ? 's' : ''}/month</td>
                        <td>
                          <button
                            className="btn btn-small btn-danger"
                            onClick={() => handleRemoveOverride(o.userId)}
                            disabled={removingUserId === o.userId}
                          >
                            {removingUserId === o.userId ? 'Removing...' : 'Remove'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {availableUsers.length > 0 && (
                <form onSubmit={handleAddOverride} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div className="form-group" style={{ marginBottom: 0, minWidth: '340px', position: 'relative' }}>
                    <label htmlFor="overrideUserSearch">User</label>
                    <input
                      id="overrideUserSearch"
                      type="search"
                      value={userSearch}
                      onChange={(e) => {
                        setUserSearch(e.target.value);
                        setOverrideUserId('');
                        setShowUserDropdown(true);
                      }}
                      onFocus={() => setShowUserDropdown(true)}
                      onBlur={() => setTimeout(() => setShowUserDropdown(false), 150)}
                      placeholder="Search by name or email..."
                      autoComplete="off"
                    />
                    {showUserDropdown && (
                      <ul style={{
                        position: 'absolute', zIndex: 10, top: '100%', left: 0, right: 0,
                        margin: 0, padding: 0, listStyle: 'none',
                        background: 'var(--card-bg, #fff)',
                        border: '1px solid var(--border-color, #e5e7eb)',
                        borderRadius: '0 0 6px 6px',
                        maxHeight: '200px', overflowY: 'auto',
                        boxShadow: '0 4px 8px rgba(0,0,0,0.08)',
                      }}>
                        {filteredUsers.length === 0 ? (
                          <li style={{ padding: '0.5rem 0.75rem', color: '#6b7280', fontSize: '0.875rem' }}>
                            No users match
                          </li>
                        ) : (
                          filteredUsers.map((u) => {
                            const company = companyMap.get(u.companyId);
                            const companyEnabled = company?.deskBookingEnabled ?? false;
                            return (
                              <li
                                key={u.id}
                                onMouseDown={() => {
                                  setOverrideUserId(u.id);
                                  setUserSearch(`${u.name} (${u.email})`);
                                  setShowUserDropdown(false);
                                }}
                                style={{
                                  padding: '0.5rem 0.75rem', cursor: 'pointer', fontSize: '0.875rem',
                                  background: overrideUserId === u.id ? 'var(--primary-light, #eff6ff)' : 'transparent',
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover-bg, #f3f4f6)')}
                                onMouseLeave={(e) => (e.currentTarget.style.background = overrideUserId === u.id ? 'var(--primary-light, #eff6ff)' : 'transparent')}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                  {u.name}
                                  {!companyEnabled && (
                                    <span style={{
                                      fontSize: '0.7rem', padding: '1px 5px',
                                      background: '#fef3c7', color: '#92400e',
                                      borderRadius: '3px', whiteSpace: 'nowrap',
                                    }}>company not enabled</span>
                                  )}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                                  {u.email}{company ? ` · ${company.name}` : ''}
                                </div>
                              </li>
                            );
                          })
                        )}
                      </ul>
                    )}
                  </div>
                  <div className="form-group" style={{ marginBottom: 0, width: '140px' }}>
                    <label htmlFor="overrideQuotaInput">Days/month</label>
                    <input
                      id="overrideQuotaInput"
                      type="number"
                      min={1}
                      max={31}
                      value={overrideQuota}
                      onChange={(e) => setOverrideQuota(e.target.value)}
                      placeholder="e.g. 20"
                      required
                    />
                  </div>
                  <button type="submit" className="btn btn-secondary" disabled={savingOverride || !overrideUserId} style={{ marginBottom: '1px' }}>
                    {savingOverride ? 'Saving...' : 'Add Exception'}
                  </button>
                </form>
              )}

              {availableUsers.length === 0 && overrides.length > 0 && (
                <p style={{ color: '#6b7280', fontSize: '0.875rem', margin: 0 }}>All users have an exception set.</p>
              )}
            </div>
          )}
        </>
      )}

      {/* ─── Company Access tab ─── */}
      {activeTab === 'access' && (
        <>
          <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
            Enable hot desk booking for specific companies. Disabled by default.
          </p>

          {companyAccessError && <div className="alert alert-error">{companyAccessError}</div>}

          {companies.length === 0 ? (
            <p style={{ color: '#6b7280', fontSize: '0.875rem', margin: 0 }}>No companies in this park.</p>
          ) : (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Company</th>
                    <th>Desk Booking</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {companies.map((company) => (
                    <tr key={company.id}>
                      <td>{company.name}</td>
                      <td>
                        <span className={`status-badge ${company.deskBookingEnabled ? 'active' : 'inactive'}`}>
                          {company.deskBookingEnabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </td>
                      <td>
                        <button
                          className={`btn btn-small ${company.deskBookingEnabled ? 'btn-warning' : 'btn-success'}`}
                          onClick={() => handleToggleCompanyAccess(company)}
                          disabled={togglingCompanyId === company.id}
                        >
                          {togglingCompanyId === company.id
                            ? 'Saving...'
                            : company.deskBookingEnabled ? 'Disable' : 'Enable'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ─── Desk create/edit modal ─── */}
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingDesk ? 'Edit Desk' : 'Add Desk'}</h2>
              <button className="modal-close" onClick={closeModal} aria-label="Close">×</button>
            </div>
            <form onSubmit={handleDeskSubmit}>
              <div className="modal-body">
                {deskError && <div className="alert alert-error">{deskError}</div>}

                <div className="form-group">
                  <label htmlFor="name">Name *</label>
                  <input
                    type="text" id="name" name="name"
                    value={deskForm.name} onChange={handleDeskFormChange}
                    required maxLength={255} placeholder="e.g. Desk 1, Open Plan A"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="floor">Floor / Location</label>
                  <input
                    type="text" id="floor" name="floor"
                    value={deskForm.floor} onChange={handleDeskFormChange}
                    maxLength={100} placeholder="e.g. Floor 2"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="description">Description</label>
                  <textarea
                    id="description" name="description"
                    value={deskForm.description} onChange={handleDeskFormChange}
                    maxLength={2000} rows={2} placeholder="Optional notes"
                  />
                </div>
                <div className="form-group">
                  <label>Features</label>
                  <div className="amenities-grid">
                    {COMMON_DESK_FEATURES.map((feature) => (
                      <label key={feature} className="amenity-checkbox">
                        <input
                          type="checkbox"
                          checked={deskForm.features.includes(feature)}
                          onChange={() => handleFeatureToggle(feature)}
                        />
                        <span>{feature}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : editingDesk ? 'Save Changes' : 'Add Desk'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
