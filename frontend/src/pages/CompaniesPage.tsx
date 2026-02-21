import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { Company, Settings, TwoFaLevelEnforcement } from '../types';

export function CompaniesPage() {
  const navigate = useNavigate();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    address: ''
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [companyTwofaEnforcement, setCompanyTwofaEnforcement] = useState<TwoFaLevelEnforcement>('inherit');

  useEffect(() => {
    loadCompanies();
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const data = await api.getSettings();
      setSettings(data);
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const loadCompanies = async () => {
    setLoading(true);
    try {
      const data = await api.getCompanies();
      setCompanies(data);
    } catch (error) {
      console.error('Failed to load companies:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (company?: Company) => {
    if (company) {
      setEditingCompany(company);
      setFormData({
        name: company.name,
        address: company.address
      });
      setCompanyTwofaEnforcement(company.twofaEnforcement || 'inherit');
    } else {
      setEditingCompany(null);
      setFormData({
        name: '',
        address: ''
      });
      setCompanyTwofaEnforcement('inherit');
    }
    setError('');
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);

    try {
      if (editingCompany) {
        await api.updateCompany(editingCompany.id, { ...formData, twofaEnforcement: companyTwofaEnforcement });
      } else {
        await api.createCompany(formData);
      }
      setShowModal(false);
      loadCompanies();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save company');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this company? All users in this company will also be deleted.')) return;

    try {
      await api.deleteCompany(id);
      loadCompanies();
    } catch (error) {
      console.error('Failed to delete company:', error);
    }
  };

  if (loading) {
    return <div className="loading">Loading companies...</div>;
  }

  return (
    <div className="companies-page">
      <div className="page-header">
        <h1>Company Management</h1>
        <button className="btn btn-primary" onClick={() => handleOpenModal()}>
          Add Company
        </button>
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Address</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {companies.map(company => (
              <tr key={company.id}>
                <td>{company.name}</td>
                <td>{company.address}</td>
                <td>
                  <div className="action-buttons">
                    <button
                      className="btn btn-small btn-secondary"
                      onClick={() => handleOpenModal(company)}
                    >
                      Edit
                    </button>
                    <button
                      className="btn btn-small btn-secondary"
                      onClick={() => navigate(`/admin/ldap/${company.id}`)}
                    >
                      LDAP
                    </button>
                    <button
                      className="btn btn-small btn-secondary"
                      onClick={() => navigate(`/admin/sso/${company.id}`)}
                    >
                      SSO
                    </button>
                    <button
                      className="btn btn-small btn-danger"
                      onClick={() => handleDelete(company.id)}
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
              <h2>{editingCompany ? 'Edit Company' : 'Add Company'}</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {error && <div className="alert alert-error">{error}</div>}

                <div className="form-group">
                  <label htmlFor="name">Company Name *</label>
                  <input
                    type="text"
                    id="name"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    required
                    placeholder="Enter company name"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="address">Address *</label>
                  <textarea
                    id="address"
                    value={formData.address}
                    onChange={e => setFormData({ ...formData, address: e.target.value })}
                    required
                    placeholder="Enter company address"
                    rows={3}
                  />
                </div>

                {editingCompany && settings?.twofaEnforcement === 'optional' && (
                  <div className="form-group">
                    <label htmlFor="companyTwofaEnforcement">Two-Factor Authentication</label>
                    <select
                      id="companyTwofaEnforcement"
                      value={companyTwofaEnforcement}
                      onChange={e => setCompanyTwofaEnforcement(e.target.value as TwoFaLevelEnforcement)}
                    >
                      <option value="inherit">Inherit from Park</option>
                      <option value="optional">Optional - Users can enable 2FA</option>
                      <option value="required">Required - All users in this company must use 2FA</option>
                    </select>
                    <small>Override park 2FA enforcement for this company</small>
                  </div>
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
