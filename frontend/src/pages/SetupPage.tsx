import React, { useState } from 'react';

interface SetupPageProps {
  onSetupComplete: () => void;
}

type SetupMode = 'select' | 'demo' | 'production';

interface DemoCredential {
  email: string;
  password: string;
  description: string;
}

interface DemoCredentials {
  superAdmin: DemoCredential;
  parkAdmin: DemoCredential;
  companyAdmin: DemoCredential;
  user: DemoCredential;
}

interface DemoResponse {
  success: boolean;
  message: string;
  parks: { name: string; id: string }[];
  credentials: DemoCredentials;
}

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

export function SetupPage({ onSetupComplete }: SetupPageProps) {
  const [mode, setMode] = useState<SetupMode>('select');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [demoData, setDemoData] = useState<DemoResponse | null>(null);

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

      setDemoData(data);
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
            <h1>Welcome to Open Meeting</h1>
            <p>Let's get started by setting up your system</p>
          </div>

          <div className="setup-options">
            <div className="setup-option" onClick={() => setMode('demo')}>
              <div className="option-icon">🎮</div>
              <h2>Demo Mode</h2>
              <p>Try out the system with pre-configured sample data including multiple parks, companies, and meeting rooms.</p>
              <ul>
                <li>3 sample parks with rooms</li>
                <li>Multiple companies per park</li>
                <li>Various user roles to test</li>
              </ul>
              <button className="btn btn-secondary">Start Demo</button>
            </div>

            <div className="setup-option" onClick={() => setMode('production')}>
              <div className="option-icon">🏢</div>
              <h2>Production Mode</h2>
              <p>Set up a fresh system for your organization with your own admin account.</p>
              <ul>
                <li>Create your organization</li>
                <li>Set up super admin account</li>
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
  if (mode === 'demo' && demoData) {
    return (
      <div className="setup-container">
        <div className="setup-card setup-card-wide">
          <div className="setup-header">
            <h1>Demo Setup Complete!</h1>
            <p>Your demo environment is ready with {demoData.parks.length} parks</p>
          </div>

          <div className="demo-parks">
            <h3>Created Parks</h3>
            <div className="parks-list">
              {demoData.parks.map(park => (
                <span key={park.id} className="park-badge">{park.name}</span>
              ))}
            </div>
          </div>

          <div className="demo-credentials">
            <h3>Demo Accounts</h3>
            <p>Use these credentials to log in and explore different role capabilities:</p>

            <div className="credentials-grid">
              <div className="credential-card credential-super">
                <div className="credential-role">Super Admin</div>
                <p className="credential-desc">{demoData.credentials.superAdmin.description}</p>
                <div className="credential-details">
                  <div><strong>Email:</strong> {demoData.credentials.superAdmin.email}</div>
                  <div><strong>Password:</strong> {demoData.credentials.superAdmin.password}</div>
                </div>
              </div>

              <div className="credential-card credential-park">
                <div className="credential-role">Park Admin</div>
                <p className="credential-desc">{demoData.credentials.parkAdmin.description}</p>
                <div className="credential-details">
                  <div><strong>Email:</strong> {demoData.credentials.parkAdmin.email}</div>
                  <div><strong>Password:</strong> {demoData.credentials.parkAdmin.password}</div>
                </div>
              </div>

              <div className="credential-card credential-company">
                <div className="credential-role">Company Admin</div>
                <p className="credential-desc">{demoData.credentials.companyAdmin.description}</p>
                <div className="credential-details">
                  <div><strong>Email:</strong> {demoData.credentials.companyAdmin.email}</div>
                  <div><strong>Password:</strong> {demoData.credentials.companyAdmin.password}</div>
                </div>
              </div>

              <div className="credential-card credential-user">
                <div className="credential-role">Regular User</div>
                <p className="credential-desc">{demoData.credentials.user.description}</p>
                <div className="credential-details">
                  <div><strong>Email:</strong> {demoData.credentials.user.email}</div>
                  <div><strong>Password:</strong> {demoData.credentials.user.password}</div>
                </div>
              </div>
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
              <li><strong>3 parks:</strong> Downtown Business Park, Tech Innovation Hub, Creative Arts Center</li>
              <li><strong>7 companies</strong> across all parks</li>
              <li><strong>12 users</strong> with different roles (super admin, park admins, company admins, users)</li>
              <li><strong>10 meeting rooms</strong> with various capacities and amenities</li>
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
          <p>Create your organization and super admin account</p>
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
            <h3>Super Administrator Account</h3>

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
