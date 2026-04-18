import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api';
import { User, Company, UserRole } from '../types';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';
import { BulkImportModal } from '../components/BulkImportModal';

const DISABLE_DURATION_OPTIONS = [
  { key: '1h', hours: 1 },
  { key: '24h', hours: 24 },
  { key: '3d', hours: 72 },
  { key: '7d', hours: 168 },
  { key: '30d', hours: 720 },
];

export function UsersPage() {
  const { t } = useTranslation();
  const { user: currentUser, isAdmin, isSuperAdmin } = useAuth();
  const showConfirm = useConfirm();
  const [users, setUsers] = useState<User[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
    role: UserRole.USER,
    companyId: '',
    isReceptionist: false
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [disableTarget, setDisableTarget] = useState<User | null>(null);
  const [disableHours, setDisableHours] = useState(24);
  const [disableReason, setDisableReason] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [usersData, companiesData] = await Promise.all([
        isAdmin ? api.getUsers() : api.getUsersByCompany(currentUser!.companyId),
        api.getCompanies()
      ]);
      setUsers(usersData);
      setCompanies(companiesData);
      if (currentUser) {
        setFormData(prev => prev.companyId ? prev : { ...prev, companyId: currentUser.companyId });
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, currentUser]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenModal = (user?: User) => {
    if (user) {
      setEditingUser(user);
      setFormData({
        email: user.email,
        password: '',
        name: user.name,
        role: user.role,
        companyId: user.companyId,
        isReceptionist: user.addonRoles?.includes('receptionist') || false
      });
    } else {
      setEditingUser(null);
      setFormData({
        email: '',
        password: '',
        name: '',
        role: UserRole.USER,
        companyId: currentUser?.companyId || '',
        isReceptionist: false
      });
    }
    setError('');
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);

    try {
      if (editingUser) {
        const updateData: any = {
          email: formData.email,
          name: formData.name
        };
        if (formData.password) {
          updateData.password = formData.password;
        }
        if (isAdmin) {
          updateData.role = formData.role;
          updateData.companyId = formData.companyId;
          updateData.addonRoles = formData.isReceptionist ? ['receptionist'] : [];
        }
        await api.updateUser(editingUser.id, updateData);
      } else {
        await api.createUser({
          email: formData.email,
          role: formData.role,
          companyId: formData.companyId,
          addonRoles: formData.isReceptionist ? ['receptionist'] : []
        });
      }
      setShowModal(false);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save user');
    } finally {
      setSaving(false);
    }
  };

  const handleResendInvite = async (id: string) => {
    try {
      await api.resendInvite(id);
    } catch (error) {
      console.error('Failed to resend invite:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!await showConfirm({ message: t('users.deleteConfirm'), title: t('users.deleteUserTitle'), confirmLabel: t('common.delete') })) return;

    try {
      await api.deleteUser(id);
      loadData();
    } catch (error) {
      console.error('Failed to delete user:', error);
    }
  };

  const handleOpenDisable = (user: User) => {
    setDisableTarget(user);
    setDisableHours(24);
    setDisableReason('');
  };

  const handleDisableSubmit = async () => {
    if (!disableTarget) return;
    setSaving(true);
    try {
      const until = new Date(Date.now() + disableHours * 60 * 60 * 1000).toISOString();
      await api.disableUser(disableTarget.id, until, disableReason || undefined);
      setDisableTarget(null);
      loadData();
    } catch (err) {
      console.error('Failed to disable user:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleEnable = async (user: User) => {
    try {
      await api.enableUser(user.id);
      loadData();
    } catch (err) {
      console.error('Failed to enable user:', err);
    }
  };

  const isCurrentlyDisabled = (user: User) =>
    !!user.disabledUntil && new Date(user.disabledUntil) > new Date();

  const getCompanyName = (companyId: string) => {
    return companies.find(c => c.id === companyId)?.name || t('common.unknown');
  };

  if (loading) {
    return <div className="loading">{t('users.loading')}</div>;
  }

  return (
    <div className="users-page">
      <div className="page-header">
        <h1>{t('users.title')}</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary" onClick={() => setShowBulkModal(true)}>
            {t('users.addMultiple')}
          </button>
          <button className="btn btn-primary" onClick={() => handleOpenModal()}>
            {t('users.addUser')}
          </button>
        </div>
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('users.name')}</th>
              <th>{t('users.email')}</th>
              <th>{t('users.role')}</th>
              <th>{t('users.source')}</th>
              {isAdmin && <th>{t('users.company')}</th>}
              <th>{t('users.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id} style={user.isActive === false || isCurrentlyDisabled(user) ? { opacity: 0.5 } : undefined}>
                <td>
                  {user.name || <em style={{ color: 'var(--text-muted)' }}>{t('users.notSetUp')}</em>}
                  {user.isActive === false && user.inviteToken && (
                    <span className="role-badge" style={{ marginLeft: '0.25rem', background: '#d97706', color: '#fff' }}>{t('users.invitePending')}</span>
                  )}
                  {user.isActive === false && !user.inviteToken && (
                    <span className="role-badge" style={{ marginLeft: '0.25rem', background: 'var(--danger)', color: '#fff' }}>{t('users.disabledBadge')}</span>
                  )}
                  {isCurrentlyDisabled(user) && (
                    <span
                      className="role-badge"
                      style={{ marginLeft: '0.25rem', background: '#f59e0b', color: '#fff', cursor: 'help' }}
                      title={`Suspended until ${new Date(user.disabledUntil!).toLocaleString()}${user.disableReason ? ` — ${user.disableReason}` : ''}`}
                    >
                      {t('users.suspendedBadge')}
                    </span>
                  )}
                </td>
                <td>{user.email}</td>
                <td>
                  <span className={`role-badge ${user.role}`}>
                    {t(`users.roles.${user.role}`, { defaultValue: user.role.replace('_', ' ') })}
                  </span>
                  {user.addonRoles?.includes('receptionist') && (
                    <span className="role-badge receptionist" style={{ marginLeft: '0.25rem' }}>{t('users.receptionistBadge')}</span>
                  )}
                </td>
                <td>
                  <span className="role-badge" style={{
                    background: user.authSource === 'ldap' ? '#2563eb' : user.authSource === 'oidc' ? '#7c3aed' : user.authSource === 'saml' ? '#059669' : 'var(--bg-tertiary)',
                    color: user.authSource !== 'local' ? '#fff' : 'inherit'
                  }}>
                    {user.authSource === 'ldap' ? 'LDAP' : user.authSource === 'oidc' ? 'OIDC' : user.authSource === 'saml' ? 'SAML' : 'Local'}
                  </span>
                </td>
                {isAdmin && <td>{getCompanyName(user.companyId)}</td>}
                <td>
                  <div className="action-buttons">
                    {user.isActive === false && user.inviteToken && (
                      <button
                        className="btn btn-small btn-secondary"
                        onClick={() => handleResendInvite(user.id)}
                      >
                        {t('users.resendInvite')}
                      </button>
                    )}
                    <button
                      className="btn btn-small btn-secondary"
                      onClick={() => handleOpenModal(user)}
                      disabled={user.id === currentUser?.id}
                    >
                      {t('common.edit')}
                    </button>
                    {isAdmin && user.id !== currentUser?.id && user.isActive !== false && (
                      isCurrentlyDisabled(user) ? (
                        <button
                          className="btn btn-small btn-secondary"
                          onClick={() => handleEnable(user)}
                        >
                          {t('users.enable')}
                        </button>
                      ) : (
                        <button
                          className="btn btn-small btn-warning"
                          onClick={() => handleOpenDisable(user)}
                        >
                          {t('users.suspend')}
                        </button>
                      )
                    )}
                    <button
                      className="btn btn-small btn-danger"
                      onClick={() => handleDelete(user.id)}
                      disabled={user.id === currentUser?.id || (!isAdmin && user.role !== UserRole.USER)}
                    >
                      {t('common.delete')}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showBulkModal && (
        <BulkImportModal
          companies={companies}
          currentUserCompanyId={currentUser?.companyId || ''}
          currentUserCompanyName={companies.find(c => c.id === currentUser?.companyId)?.name || ''}
          isAdmin={isAdmin}
          isSuperAdmin={isSuperAdmin}
          onClose={() => setShowBulkModal(false)}
          onComplete={loadData}
        />
      )}

      {disableTarget && (
        <div className="modal-overlay" onClick={() => setDisableTarget(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{t('users.suspendUser')}</h2>
              <button className="modal-close" onClick={() => setDisableTarget(null)} aria-label={t('common.close')}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: '1rem' }}
                dangerouslySetInnerHTML={{ __html: t('users.suspendInfo', { name: `<strong>${disableTarget.name || disableTarget.email}</strong>` }) }}
              />
              <div className="form-group">
                <label htmlFor="disableDuration">{t('users.duration')}</label>
                <select
                  id="disableDuration"
                  value={disableHours}
                  onChange={e => setDisableHours(Number(e.target.value))}
                >
                  {DISABLE_DURATION_OPTIONS.map(opt => (
                    <option key={opt.hours} value={opt.hours}>{t(`users.suspendDurations.${opt.key}`)}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="disableReason">{t('users.reason')}</label>
                <input
                  type="text"
                  id="disableReason"
                  value={disableReason}
                  onChange={e => setDisableReason(e.target.value)}
                  placeholder={t('users.reasonPlaceholder')}
                  maxLength={200}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setDisableTarget(null)}>
                {t('common.cancel')}
              </button>
              <button type="button" className="btn btn-warning" onClick={handleDisableSubmit} disabled={saving}>
                {saving ? t('users.suspending') : t('users.suspendUser')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingUser ? t('users.editUserTitle') : t('users.addUserTitle')}</h2>
              <button className="modal-close" onClick={() => setShowModal(false)} aria-label={t('common.close')}>×</button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {error && <div className="alert alert-error">{error}</div>}

                {!editingUser && (
                  <div className="alert" style={{ background: 'var(--bg-secondary)', borderLeft: '3px solid var(--primary)', marginBottom: '1rem', padding: '0.75rem 1rem', borderRadius: '4px', fontSize: '0.9rem' }}>
                    {t('users.inviteEmailInfo')}
                  </div>
                )}

                {editingUser && (
                  <div className="form-group">
                    <label htmlFor="name">{t('common.name')} *</label>
                    <input
                      type="text"
                      id="name"
                      value={formData.name}
                      onChange={e => setFormData({ ...formData, name: e.target.value })}
                      required
                    />
                  </div>
                )}

                <div className="form-group">
                  <label htmlFor="email">{t('common.email')} *</label>
                  <input
                    type="email"
                    id="email"
                    value={formData.email}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                    required
                    readOnly={!!editingUser}
                  />
                </div>

                {editingUser && (
                  editingUser.authSource && editingUser.authSource !== 'local' ? (
                    <div className="form-group">
                      <label>{t('common.password')}</label>
                      <small style={{ color: 'var(--text-muted)' }}>
                        {editingUser.authSource === 'ldap' ? t('users.managedByLdap') : t('users.managedBySso')}
                      </small>
                    </div>
                  ) : (
                    <div className="form-group">
                      <label htmlFor="password">{t('users.keepCurrentPassword')}</label>
                      <input
                        type="password"
                        id="password"
                        value={formData.password}
                        onChange={e => setFormData({ ...formData, password: e.target.value })}
                        minLength={6}
                      />
                    </div>
                  )
                )}

                {isAdmin && (
                  <>
                    <div className="form-group">
                      <label htmlFor="role">{t('common.role')} *</label>
                      <select
                        id="role"
                        value={formData.role}
                        onChange={e => setFormData({ ...formData, role: e.target.value as UserRole })}
                      >
                        <option value={UserRole.USER}>{t('users.roles.user')}</option>
                        <option value={UserRole.COMPANY_ADMIN}>{t('users.roles.company_admin')}</option>
                        {isSuperAdmin && <option value={UserRole.PARK_ADMIN}>{t('users.roles.park_admin')}</option>}
                        {isSuperAdmin && <option value={UserRole.SUPER_ADMIN}>{t('users.roles.super_admin')}</option>}
                      </select>
                    </div>

                    <div className="form-group">
                      <label htmlFor="companyId">{t('common.company')} *</label>
                      <select
                        id="companyId"
                        value={formData.companyId}
                        onChange={e => setFormData({ ...formData, companyId: e.target.value })}
                        required
                      >
                        <option value="">{t('users.selectCompany')}</option>
                        {companies.map(company => (
                          <option key={company.id} value={company.id}>
                            {company.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={formData.isReceptionist}
                          onChange={e => setFormData({ ...formData, isReceptionist: e.target.checked })}
                        />
                        {t('users.receptionistRole')}
                      </label>
                    </div>
                  </>
                )}
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                  {t('common.cancel')}
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? (editingUser ? t('common.saving') : t('users.sending')) : (editingUser ? t('users.save') : t('users.sendInvite'))}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
