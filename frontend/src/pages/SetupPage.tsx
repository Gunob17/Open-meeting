import React, { useState } from 'react';

interface SetupPageProps {
  onSetupComplete: () => void;
}

type SetupMode = 'select' | 'demo' | 'production';

interface DemoCredentials {
  admin: { email: string; password: string };
  companyAdmin: { email: string; password: string };
  user: { email: string; password: string };
}

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

export function SetupPage({ onSetupComplete }: SetupPageProps) {
  const [mode, setMode] = useState<SetupMode>('select');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [demoCredentials, setDemoCredentials] = useState<DemoCredentials | null>(null);

  // Production form state
  const [companyName, setCompanyName] = useState('');
  const [companyAddress, setCompanyAddress] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleDemoSetup = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE}/setup/demo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to setup demo');
      }

      setDemoCredentials(data.credentials);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed');
    } finally {
      setLoading(false);
    }
  };

  const handleProductionSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (adminPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (adminPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/setup/production`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName,
          companyAddress,
          adminName,
          adminEmail,
          adminPassword
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to complete setup');
      }

      onSetupComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed');
    } finally {
      setLoading(false);
    }
  };

  // Mode selection screen
  if (mode === 'select') {
    return (
      <div className="setup-container">
        <div className="setup-card">
          <div className="setup-header">
            <h1>Welcome to Meeting Room Booking</h1>
            <p>Let's get started by setting up your system</p>
          </div>

          <div className="setup-options">
            <div className="setup-option" onClick={() => setMode('demo')}>
              <div className="option-icon">🎮</div>
              <h2>Demo Mode</h2>
              <p>Try out the system with pre-configured sample data including users, companies, and meeting rooms.</p>
              <ul>
                <li>Sample companies and users</li>
                <li>Pre-configured meeting rooms</li>
                <li>Ready-to-use demo accounts</li>
              </ul>
              <button className="btn btn-secondary">Start Demo</button>
            </div>

            <div className="setup-option" onClick={() => setMode('production')}>
              <div className="option-icon">🏢</div>
              <h2>Production Mode</h2>
              <p>Set up a fresh system for your organization with your own admin account.</p>
              <ul>
                <li>Create your organization</li>
                <li>Set up admin account</li>
                <li>Start from scratch</li>
              </ul>
              <button className="btn btn-primary">Get Started</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Demo mode result
  if (mode === 'demo' && demoCredentials) {
    return (
      <div className="setup-container">
        <div className="setup-card">
          <div className="setup-header">
            <h1>Demo Setup Complete!</h1>
            <p>Your demo environment is ready to use</p>
          </div>

          <div className="demo-credentials">
            <h3>Demo Accounts</h3>
            <p>Use these credentials to log in:</p>

            <div className="credential-card">
              <h4>System Administrator</h4>
              <p><strong>Email:</strong> {demoCredentials.admin.email}</p>
              <p><strong>Password:</strong> {demoCredentials.admin.password}</p>
            </div>

            <div className="credential-card">
              <h4>Company Admin</h4>
              <p><strong>Email:</strong> {demoCredentials.companyAdmin.email}</p>
              <p><strong>Password:</strong> {demoCredentials.companyAdmin.password}</p>
            </div>

            <div className="credential-card">
              <h4>Regular User</h4>
              <p><strong>Email:</strong> {demoCredentials.user.email}</p>
              <p><strong>Password:</strong> {demoCredentials.user.password}</p>
            </div>
          </div>

          <button className="btn btn-primary btn-block" onClick={onSetupComplete}>
            Continue to Login
          </button>
        </div>
      </div>
    );
  }

  // Demo mode confirmation
  if (mode === 'demo') {
    return (
      <div className="setup-container">
        <div className="setup-card">
          <div className="setup-header">
            <h1>Demo Mode Setup</h1>
            <p>This will create sample data for testing</p>
          </div>

          {error && <div className="alert alert-error">{error}</div>}

          <div className="demo-info">
            <h3>What will be created:</h3>
            <ul>
              <li>3 sample companies</li>
              <li>6 user accounts (admin, company admins, regular users)</li>
              <li>6 meeting rooms with various capacities and amenities</li>
            </ul>
          </div>

          <div className="setup-actions">
            <button
              className="btn btn-secondary"
              onClick={() => setMode('select')}
              disabled={loading}
            >
              Back
            </button>
            <button
              className="btn btn-primary"
              onClick={handleDemoSetup}
              disabled={loading}
            >
              {loading ? 'Setting up...' : 'Create Demo Data'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Production mode form
  return (
    <div className="setup-container">
      <div className="setup-card">
        <div className="setup-header">
          <h1>Production Setup</h1>
          <p>Create your organization and admin account</p>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleProductionSetup} className="setup-form">
          <div className="form-section">
            <h3>Organization Details</h3>

            <div className="form-group">
              <label htmlFor="companyName">Organization Name *</label>
              <input
                type="text"
                id="companyName"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                required
                placeholder="Your Company Name"
              />
            </div>

            <div className="form-group">
              <label htmlFor="companyAddress">Address *</label>
              <textarea
                id="companyAddress"
                value={companyAddress}
                onChange={(e) => setCompanyAddress(e.target.value)}
                required
                placeholder="123 Business St, City, Country"
                rows={2}
              />
            </div>
          </div>

          <div className="form-section">
            <h3>Administrator Account</h3>

            <div className="form-group">
              <label htmlFor="adminName">Full Name *</label>
              <input
                type="text"
                id="adminName"
                value={adminName}
                onChange={(e) => setAdminName(e.target.value)}
                required
                placeholder="John Doe"
              />
            </div>

            <div className="form-group">
              <label htmlFor="adminEmail">Email Address *</label>
              <input
                type="email"
                id="adminEmail"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                required
                placeholder="admin@yourcompany.com"
              />
            </div>

            <div className="form-group">
              <label htmlFor="adminPassword">Password *</label>
              <input
                type="password"
                id="adminPassword"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                required
                minLength={6}
                placeholder="Minimum 6 characters"
              />
            </div>

            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm Password *</label>
              <input
                type="password"
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                placeholder="Confirm your password"
              />
            </div>
          </div>

          <div className="setup-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setMode('select')}
              disabled={loading}
            >
              Back
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
            >
              {loading ? 'Creating...' : 'Complete Setup'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
