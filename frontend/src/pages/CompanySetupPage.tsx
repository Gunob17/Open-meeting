import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';

interface Props {
  onComplete: () => void;
}

export function CompanySetupPage({ onComplete }: Props) {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Company name is required');
      return;
    }

    setLoading(true);
    try {
      await api.completeCompanySetup(user!.companyId, { name: name.trim(), address: address.trim() });
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save company details. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1>Set up your company</h1>
          <p>Your account is ready. Please complete your company profile to continue.</p>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="companyName">Company name</label>
            <input
              type="text"
              id="companyName"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Acme Corp"
              autoFocus
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="companyAddress">
              Address{' '}
              <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>(optional)</span>
            </label>
            <input
              type="text"
              id="companyAddress"
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="123 Main Street, City"
            />
          </div>

          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? 'Saving...' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  );
}
