import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { User, Company, UserRole } from '../types';
import { useAuth } from '../context/AuthContext';

export function UsersPage() {
  const { user: currentUser, isAdmin, isSuperAdmin } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
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
    if (!window.confirm('Are you sure you want to delete this user?')) return;

    try {
      await api.deleteUser(id);
      loadData();
    } catch (error) {
      console.error('Failed to delete user:', error);
    }
  };

  const getCompanyName = (companyId: string) => {
    return companies.find(c => c.id === companyId)?.name || 'Unknown';
  };

  if (loading) {
    return <div className="loading">Loading users...</div>;
  }

  return (
    <div className="users-page">
      <div className="page-header">
        <h1>User Management</h1>
        <button className="btn btn-primary" onClick={() => handleOpenModal()}>
          Add User
        </button>
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Source</th>
              {isAdmin && <th>Company</th>}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id} style={user.isActive === false ? { opacity: 0.5 } : undefined}>
                <td>
                  {user.name || <em style={{ color: 'var(--text-muted)' }}>Not set up</em>}
                  {user.isActive === false && user.inviteToken && (
                    <span className="role-badge" style={{ marginLeft: '0.25rem', background: '#d97706', color: '#fff' }}>invite pending</span>
                  )}
                  {user.isActive === false && !user.inviteToken && (
                    <span className="role-badge" style={{ marginLeft: '0.25rem', background: 'var(--danger)', color: '#fff' }}>disabled</span>
                  )}
                </td>
                <td>{user.email}</td>
                <td>
                  <span className={`role-badge ${user.role}`}>
                    {user.role.replace('_', ' ')}
                  </span>
                  {user.addonRoles?.includes('receptionist') && (
                    <span className="role-badge receptionist" style={{ marginLeft: '0.25rem' }}>receptionist</span>
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
                        Resend invite
                      </button>
                    )}
                    <button
                      className="btn btn-small btn-secondary"
                      onClick={() => handleOpenModal(user)}
                      disabled={user.id === currentUser?.id}
                    >
                      Edit
                    </button>
                    <button
                      className="btn btn-small btn-danger"
                      onClick={() => handleDelete(user.id)}
                      disabled={user.id === currentUser?.id || (!isAdmin && user.role !== UserRole.USER)}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingUser ? 'Edit User' : 'Add User'}</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {error && <div className="alert alert-error">{error}</div>}

                {!editingUser && (
                  <div className="alert" style={{ background: 'var(--bg-secondary)', borderLeft: '3px solid var(--primary)', marginBottom: '1rem', padding: '0.75rem 1rem', borderRadius: '4px', fontSize: '0.9rem' }}>
                    An invitation email will be sent to this address. The user will set their own name and password.
                  </div>
                )}

                {editingUser && (
                  <div className="form-group">
                    <label htmlFor="name">Name *</label>
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
                  <label htmlFor="email">Email *</label>
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
                      <label>Password</label>
                      <small style={{ color: 'var(--text-muted)' }}>
                        Managed by {editingUser.authSource === 'ldap' ? 'LDAP directory' : 'SSO identity provider'}
                      </small>
                    </div>
                  ) : (
                    <div className="form-group">
                      <label htmlFor="password">Password (leave blank to keep current)</label>
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
                      <label htmlFor="role">Role *</label>
                      <select
                        id="role"
                        value={formData.role}
                        onChange={e => setFormData({ ...formData, role: e.target.value as UserRole })}
                      >
                        <option value={UserRole.USER}>User</option>
                        <option value={UserRole.COMPANY_ADMIN}>Company Admin</option>
                        {isSuperAdmin && <option value={UserRole.PARK_ADMIN}>Park Admin</option>}
                        {isSuperAdmin && <option value={UserRole.SUPER_ADMIN}>Super Admin</option>}
                      </select>
                    </div>

                    <div className="form-group">
                      <label htmlFor="companyId">Company *</label>
                      <select
                        id="companyId"
                        value={formData.companyId}
                        onChange={e => setFormData({ ...formData, companyId: e.target.value })}
                        required
                      >
                        <option value="">Select company</option>
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
                        Receptionist (can manage guest check-in/check-out)
                      </label>
                    </div>
                  </>
                )}
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? (editingUser ? 'Saving...' : 'Sending...') : (editingUser ? 'Save' : 'Send Invite')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
