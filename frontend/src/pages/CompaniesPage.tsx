import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { Company, Settings, TwoFaLevelEnforcement } from '../types';
import { useConfirm } from '../context/ConfirmContext';

export function CompaniesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const showConfirm = useConfirm();
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
    if (!await showConfirm({ message: t('companies.deleteConfirm'), title: t('companies.deleteTitle'), confirmLabel: t('common.delete') })) return;

    try {
      await api.deleteCompany(id);
      loadCompanies();
    } catch (error) {
      console.error('Failed to delete company:', error);
    }
  };

  if (loading) {
    return <div className="loading">{t('companies.loading')}</div>;
  }

  return (
    <div className="companies-page">
      <div className="page-header">
        <h1>{t('companies.title')}</h1>
        <button className="btn btn-primary" onClick={() => handleOpenModal()}>
          {t('companies.addCompany')}
        </button>
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('companies.name')}</th>
              <th>{t('companies.address')}</th>
              <th>{t('companies.actions')}</th>
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
                      {t('common.edit')}
                    </button>
                    <button
                      className="btn btn-small btn-secondary"
                      onClick={() => navigate(`/admin/ldap/${company.id}`)}
                    >
                      {t('companies.ldap')}
                    </button>
                    <button
                      className="btn btn-small btn-secondary"
                      onClick={() => navigate(`/admin/sso/${company.id}`)}
                    >
                      {t('companies.sso')}
                    </button>
                    <button
                      className="btn btn-small btn-danger"
                      onClick={() => handleDelete(company.id)}
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

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingCompany ? t('companies.editTitle') : t('companies.addTitle')}</h2>
              <button className="modal-close" onClick={() => setShowModal(false)} aria-label={t('common.close')}>×</button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {error && <div className="alert alert-error">{error}</div>}

                <div className="form-group">
                  <label htmlFor="name">{t('companies.companyName')}</label>
                  <input
                    type="text"
                    id="name"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    required
                    placeholder={t('companies.companyNamePlaceholder')}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="address">{t('common.address')} *</label>
                  <textarea
                    id="address"
                    value={formData.address}
                    onChange={e => setFormData({ ...formData, address: e.target.value })}
                    required
                    placeholder={t('companies.addressPlaceholder')}
                    rows={3}
                  />
                </div>

                {editingCompany && settings?.twofaEnforcement === 'optional' && (
                  <div className="form-group">
                    <label htmlFor="companyTwofaEnforcement">{t('companies.twofaLabel')}</label>
                    <select
                      id="companyTwofaEnforcement"
                      value={companyTwofaEnforcement}
                      onChange={e => setCompanyTwofaEnforcement(e.target.value as TwoFaLevelEnforcement)}
                    >
                      <option value="inherit">{t('companies.twofaEnforcement.inherit')}</option>
                      <option value="optional">{t('companies.twofaEnforcement.optional')}</option>
                      <option value="required">{t('companies.twofaEnforcement.required')}</option>
                    </select>
                    <small>{t('companies.twofaDesc')}</small>
                  </div>
                )}
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                  {t('common.cancel')}
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? t('common.saving') : t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
