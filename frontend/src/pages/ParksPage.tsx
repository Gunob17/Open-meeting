import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api';
import { Park, Settings, TwoFaLevelEnforcement } from '../types';
import { useConfirm } from '../context/ConfirmContext';

export function ParksPage() {
  const { t } = useTranslation();
  const showConfirm = useConfirm();
  const [parks, setParks] = useState<Park[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingPark, setEditingPark] = useState<Park | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    description: '',
    receptionEmail: '',
    receptionGuestFields: ['name'] as string[]
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingLogoFor, setUploadingLogoFor] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [parkTwofaEnforcement, setParkTwofaEnforcement] = useState<TwoFaLevelEnforcement>('inherit');
  const [parkCalendarFeedEnabled, setParkCalendarFeedEnabled] = useState(true);

  useEffect(() => {
    loadParks();
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

  const loadParks = async () => {
    setLoading(true);
    try {
      const data = await api.getParks(true);
      setParks(data);
    } catch (error) {
      console.error('Failed to load parks:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (park?: Park) => {
    if (park) {
      setEditingPark(park);
      setFormData({
        name: park.name,
        address: park.address,
        description: park.description || '',
        receptionEmail: park.receptionEmail || '',
        receptionGuestFields: park.receptionGuestFields || ['name']
      });
      setParkTwofaEnforcement(park.twofaEnforcement || 'inherit');
      setParkCalendarFeedEnabled(park.calendarFeedEnabled !== false);
    } else {
      setEditingPark(null);
      setFormData({
        name: '',
        address: '',
        description: '',
        receptionEmail: '',
        receptionGuestFields: ['name']
      });
      setParkTwofaEnforcement('inherit');
      setParkCalendarFeedEnabled(true);
    }
    setError('');
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);

    try {
      if (editingPark) {
        await api.updatePark(editingPark.id, {
          name: formData.name,
          address: formData.address,
          description: formData.description,
          twofaEnforcement: parkTwofaEnforcement,
          receptionEmail: formData.receptionEmail || null,
          receptionGuestFields: formData.receptionGuestFields,
          calendarFeedEnabled: parkCalendarFeedEnabled,
        });
      } else {
        await api.createPark(formData);
      }
      setShowModal(false);
      loadParks();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save park');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (park: Park) => {
    try {
      await api.updatePark(park.id, { isActive: !park.isActive });
      loadParks();
    } catch (error) {
      console.error('Failed to toggle park status:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!await showConfirm({ message: t('parks.deleteConfirm'), title: t('parks.deleteTitle'), confirmLabel: t('common.delete') })) return;

    try {
      await api.deletePark(id, false);
      loadParks();
    } catch (error) {
      console.error('Failed to delete park:', error);
      alert(error instanceof Error ? error.message : 'Failed to delete park');
    }
  };

  const handleLogoClick = (parkId: string) => {
    setUploadingLogoFor(parkId);
    logoInputRef.current?.click();
  };

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadingLogoFor) return;

    try {
      await api.uploadParkLogo(uploadingLogoFor, file);
      loadParks();
    } catch (error) {
      console.error('Failed to upload logo:', error);
      alert(error instanceof Error ? error.message : 'Failed to upload logo');
    } finally {
      setUploadingLogoFor(null);
      if (logoInputRef.current) {
        logoInputRef.current.value = '';
      }
    }
  };

  const handleDeleteLogo = async (parkId: string) => {
    if (!await showConfirm({ message: t('parks.removeLogoConfirm'), title: t('parks.removeLogoTitle'), confirmLabel: t('common.remove') })) return;

    try {
      await api.deleteParkLogo(parkId);
      loadParks();
    } catch (error) {
      console.error('Failed to delete logo:', error);
      alert(error instanceof Error ? error.message : 'Failed to delete logo');
    }
  };

  if (loading) {
    return <div className="loading">{t('parks.loading')}</div>;
  }

  return (
    <div className="parks-page">
      <div className="page-header">
        <h1>{t('parks.title')}</h1>
        <button className="btn btn-primary" onClick={() => handleOpenModal()}>
          {t('parks.addPark')}
        </button>
      </div>

      {/* Hidden file input for logo upload */}
      <input
        ref={logoInputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/svg+xml,image/webp"
        style={{ display: 'none' }}
        onChange={handleLogoChange}
      />

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: '80px' }}>{t('parks.logo')}</th>
              <th>{t('parks.name')}</th>
              <th>{t('parks.address')}</th>
              <th>{t('parks.description')}</th>
              <th>{t('parks.status')}</th>
              <th>{t('parks.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {parks.map(park => (
              <tr key={park.id} className={!park.isActive ? 'inactive-row' : ''}>
                <td>
                  <div className="park-logo-cell">
                    {park.logoUrl ? (
                      <div className="park-logo-wrapper">
                        <img
                          src={park.logoUrl}
                          alt={park.name}
                          className="park-logo-preview"
                        />
                        <div className="park-logo-actions">
                          <button
                            className="btn btn-tiny"
                            onClick={() => handleLogoClick(park.id)}
                            title={t('parks.changeLogo')}
                          >
                            {t('parks.changeLogo')}
                          </button>
                          <button
                            className="btn btn-tiny btn-danger"
                            onClick={() => handleDeleteLogo(park.id)}
                            title={t('parks.removeLogo')}
                          >
                            {t('parks.removeLogo')}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        className="btn btn-small btn-secondary park-logo-upload"
                        onClick={() => handleLogoClick(park.id)}
                      >
                        {t('parks.addLogo')}
                      </button>
                    )}
                  </div>
                </td>
                <td>{park.name}</td>
                <td>{park.address}</td>
                <td>{park.description || '-'}</td>
                <td>
                  <span className={`status-badge ${park.isActive ? 'active' : 'inactive'}`}>
                    {park.isActive ? t('parks.active') : t('parks.inactive')}
                  </span>
                </td>
                <td>
                  <div className="action-buttons">
                    <button
                      className="btn btn-small btn-secondary"
                      onClick={() => handleOpenModal(park)}
                    >
                      {t('common.edit')}
                    </button>
                    <button
                      className={`btn btn-small ${park.isActive ? 'btn-warning' : 'btn-success'}`}
                      onClick={() => handleToggleActive(park)}
                    >
                      {park.isActive ? t('parks.deactivate') : t('parks.activate')}
                    </button>
                    {park.id !== 'default' && (
                      <button
                        className="btn btn-small btn-danger"
                        onClick={() => handleDelete(park.id)}
                      >
                        {t('common.delete')}
                      </button>
                    )}
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
              <h2>{editingPark ? t('parks.editTitle') : t('parks.addTitle')}</h2>
              <button className="modal-close" onClick={() => setShowModal(false)} aria-label={t('common.close')}>×</button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {error && <div className="alert alert-error">{error}</div>}

                <div className="form-group">
                  <label htmlFor="name">{t('parks.parkName')}</label>
                  <input
                    type="text"
                    id="name"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    required
                    placeholder={t('parks.parkNamePlaceholder')}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="address">{t('common.address')} *</label>
                  <textarea
                    id="address"
                    value={formData.address}
                    onChange={e => setFormData({ ...formData, address: e.target.value })}
                    required
                    placeholder={t('parks.addressPlaceholder')}
                    rows={3}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="description">{t('common.description')}</label>
                  <textarea
                    id="description"
                    value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                    placeholder={t('parks.descriptionPlaceholder')}
                    rows={3}
                  />
                </div>

                {editingPark && (
                  <div className="form-group">
                    <label htmlFor="receptionEmail">{t('parks.receptionEmail')}</label>
                    <input
                      type="email"
                      id="receptionEmail"
                      value={formData.receptionEmail}
                      onChange={e => setFormData({ ...formData, receptionEmail: e.target.value })}
                      placeholder={t('parks.receptionEmailPlaceholder')}
                    />
                    <small>{t('parks.receptionEmailDesc')}</small>

                    {formData.receptionEmail && (
                      <div className="mt-4">
                        <label>{t('parks.guestFields')}</label>
                        <small>{t('parks.guestFieldsDesc')}</small>
                        <div className="checkbox-row">
                          <label>
                            <input type="checkbox" checked disabled />
                            {t('parks.guestName')}
                          </label>
                          <label>
                            <input
                              type="checkbox"
                              checked={formData.receptionGuestFields.includes('email')}
                              onChange={e => {
                                const fields = e.target.checked
                                  ? [...formData.receptionGuestFields, 'email']
                                  : formData.receptionGuestFields.filter(f => f !== 'email');
                                setFormData({ ...formData, receptionGuestFields: fields });
                              }}
                            />
                            {t('parks.guestEmail')}
                          </label>
                          <label>
                            <input
                              type="checkbox"
                              checked={formData.receptionGuestFields.includes('company')}
                              onChange={e => {
                                const fields = e.target.checked
                                  ? [...formData.receptionGuestFields, 'company']
                                  : formData.receptionGuestFields.filter(f => f !== 'company');
                                setFormData({ ...formData, receptionGuestFields: fields });
                              }}
                            />
                            {t('parks.guestCompany')}
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {editingPark && settings?.twofaEnforcement === 'optional' && (
                  <div className="form-group">
                    <label htmlFor="parkTwofaEnforcement">{t('parks.twofa')}</label>
                    <select
                      id="parkTwofaEnforcement"
                      value={parkTwofaEnforcement}
                      onChange={e => setParkTwofaEnforcement(e.target.value as TwoFaLevelEnforcement)}
                    >
                      <option value="inherit">{t('parks.twofaOptions.inherit')}</option>
                      <option value="optional">{t('parks.twofaOptions.optional')}</option>
                      <option value="required">{t('parks.twofaOptions.required')}</option>
                    </select>
                    <small>{t('parks.twofaDesc')}</small>
                  </div>
                )}

                {editingPark && (
                  <div className="form-group">
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={parkCalendarFeedEnabled}
                        onChange={e => setParkCalendarFeedEnabled(e.target.checked)}
                      />
                      {t('parks.calendarFeed')}
                    </label>
                    <small>{t('parks.calendarFeedDesc')}</small>
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
