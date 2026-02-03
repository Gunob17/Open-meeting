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
    companyId: ''
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
        companyId: user.companyId
      });
    } else {
      setEditingUser(null);
      setFormData({
        email: '',
        password: '',
        name: '',
        role: UserRole.USER,
        companyId: currentUser?.companyId || ''
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
        }
        await api.updateUser(editingUser.id, updateData);
      } else {
        await api.createUser({
          email: formData.email,
          password: formData.password,
          name: formData.name,
          role: formData.role,
          companyId: formData.companyId
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
              {isAdmin && <th>Company</th>}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id}>
                <td>{user.name}</td>
                <td>{user.email}</td>
                <td>
                  <span className={`role-badge ${user.role}`}>
                    {user.role.replace('_', ' ')}
                  </span>
                </td>
                {isAdmin && <td>{getCompanyName(user.companyId)}</td>}
                <td>
                  <div className="action-buttons">
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

                <div className="form-group">
                  <label htmlFor="email">Email *</label>
                  <input
                    type="email"
                    id="email"
                    value={formData.email}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="password">
                    Password {editingUser ? '(leave blank to keep current)' : '*'}
                  </label>
                  <input
                    type="password"
                    id="password"
                    value={formData.password}
                    onChange={e => setFormData({ ...formData, password: e.target.value })}
                    required={!editingUser}
                    minLength={6}
                  />
                </div>

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
                  </>
                )}
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
