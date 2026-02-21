import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { TwoFaSetupResponse, SsoDiscoveryResult } from '../types';

type LoginStep = 'email' | 'password' | 'sso-redirect';

export function LoginPage() {
  const [step, setStep] = useState<LoginStep>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [keepLoggedIn, setKeepLoggedIn] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, twofaPending, twofaSetupRequired, verifyTwoFa, completeTwoFaSetup } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const passwordRef = useRef<HTMLInputElement>(null);

  // SSO state
  const [ssoInfo, setSsoInfo] = useState<SsoDiscoveryResult | null>(null);

  // 2FA verify state
  const [twofaCode, setTwofaCode] = useState('');
  const [trustDevice, setTrustDevice] = useState(false);

  // 2FA setup state
  const [setupData, setSetupData] = useState<TwoFaSetupResponse | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [setupLoading, setSetupLoading] = useState(false);

  // Check for SSO error from callback redirect
  useEffect(() => {
    const ssoError = searchParams.get('error');
    if (ssoError) {
      setError(ssoError);
    }
  }, [searchParams]);

  // Auto-focus password field when transitioning to password step
  useEffect(() => {
    if (step === 'password') {
      setTimeout(() => passwordRef.current?.focus(), 100);
    }
  }, [step]);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }

    setLoading(true);
    try {
      const result = await api.discoverSso(email);
      if (result.hasSso && result.configId) {
        setSsoInfo(result);
        setStep('sso-redirect');
        // Auto-redirect to IdP
        const apiBase = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';
        window.location.href = `${apiBase}/sso/init/${result.configId}`;
        return;
      }
    } catch {
      // SSO discovery failed — fall through to password
    } finally {
      setLoading(false);
    }

    // No SSO — show password step
    setSsoInfo(null);
    setStep('password');
  };

  const handleBack = () => {
    setStep('email');
    setPassword('');
    setError('');
    setSsoInfo(null);
  };

  const handleCredentialSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await login(email, password, keepLoggedIn);
      if (!response.requiresTwoFa) {
        navigate('/');
      } else if (response.twofaSetupRequired) {
        setSetupLoading(true);
        try {
          const setup = await api.twofaSetup();
          setSetupData(setup);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to start 2FA setup');
        } finally {
          setSetupLoading(false);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await verifyTwoFa(twofaCode, trustDevice);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSetupConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await completeTwoFaSetup(twofaCode);
      setBackupCodes(result.backupCodes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup confirmation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleBackupCodesDone = () => {
    navigate('/');
  };

  // Show backup codes after successful forced setup
  if (backupCodes) {
    return (
      <div className="login-container">
        <div className="login-card">
          <div className="login-header">
            <h1>2FA Enabled</h1>
            <p>Save your backup codes in a safe place. You will need them if you lose access to your authenticator app.</p>
          </div>
          <div className="backup-codes-grid">
            {backupCodes.map((code, i) => (
              <div key={i} className="backup-code">{code}</div>
            ))}
          </div>
          <p className="backup-codes-warning">
            These codes will not be shown again. Each code can only be used once.
          </p>
          <button onClick={handleBackupCodesDone} className="btn btn-primary btn-block">
            I've saved my backup codes
          </button>
        </div>
      </div>
    );
  }

  // 2FA Setup flow (forced by enforcement)
  if (twofaPending && twofaSetupRequired) {
    return (
      <div className="login-container">
        <div className="login-card">
          <div className="login-header">
            <h1>Set Up Two-Factor Authentication</h1>
            <p>Your organization requires 2FA. Scan the QR code with your authenticator app (Google Authenticator, Authy, etc.)</p>
          </div>

          {error && <div className="alert alert-error">{error}</div>}

          {setupLoading && <p>Loading setup...</p>}

          {setupData && (
            <>
              <div className="twofa-qr-container">
                <img src={setupData.qrCodeUrl} alt="2FA QR Code" className="twofa-qr-code" />
              </div>
              <div className="twofa-secret-display">
                <label>Manual entry key:</label>
                <code className="twofa-secret-code">{setupData.secret}</code>
              </div>

              <form onSubmit={handleSetupConfirm} className="login-form">
                <div className="form-group">
                  <label htmlFor="setupCode">Enter the 6-digit code from your app</label>
                  <input
                    type="text"
                    id="setupCode"
                    value={twofaCode}
                    onChange={(e) => setTwofaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    required
                    placeholder="000000"
                    className="twofa-code-input"
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    maxLength={6}
                  />
                </div>
                <button type="submit" className="btn btn-primary btn-block" disabled={loading || twofaCode.length < 6}>
                  {loading ? 'Verifying...' : 'Verify and Enable 2FA'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    );
  }

  // 2FA Verification flow (user already has 2FA set up)
  if (twofaPending && !twofaSetupRequired) {
    return (
      <div className="login-container">
        <div className="login-card">
          <div className="login-header">
            <h1>Two-Factor Authentication</h1>
            <p>Enter the 6-digit code from your authenticator app, or use a backup code.</p>
          </div>

          {error && <div className="alert alert-error">{error}</div>}

          <form onSubmit={handleVerifySubmit} className="login-form">
            <div className="form-group">
              <label htmlFor="twofaCode">Verification Code</label>
              <input
                type="text"
                id="twofaCode"
                value={twofaCode}
                onChange={(e) => setTwofaCode(e.target.value.replace(/[^a-fA-F0-9]/g, '').slice(0, 8))}
                required
                placeholder="Enter code"
                className="twofa-code-input"
                autoComplete="one-time-code"
                autoFocus
              />
            </div>

            <div className="form-group twofa-trust-device">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={trustDevice}
                  onChange={(e) => setTrustDevice(e.target.checked)}
                />
                Trust this device
              </label>
            </div>

            <button type="submit" className="btn btn-primary btn-block" disabled={loading || twofaCode.length < 6}>
              {loading ? 'Verifying...' : 'Verify'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // SSO redirect step — show spinner while redirecting
  if (step === 'sso-redirect') {
    return (
      <div className="login-container">
        <div className="login-card">
          <div className="login-header">
            <h1>Redirecting...</h1>
            <p>Taking you to {ssoInfo?.displayName || 'your identity provider'}</p>
          </div>
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <div className="loading-spinner" />
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-block"
            onClick={handleBack}
            style={{ marginTop: '1rem' }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Step 2: Password
  if (step === 'password') {
    return (
      <div className="login-container">
        <div className="login-card">
          <div className="login-header">
            <h1>Meeting Room Booking</h1>
            <p>Enter your password</p>
          </div>

          {error && (
            <div className="alert alert-error">
              {error}
            </div>
          )}

          <div className="login-email-display" onClick={handleBack}>
            <span className="login-email-text">{email}</span>
            <span className="login-email-change">Change</span>
          </div>

          <form onSubmit={handleCredentialSubmit} className="login-form">
            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                ref={passwordRef}
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Enter your password"
              />
            </div>

            <div className="form-group keep-logged-in">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={keepLoggedIn}
                  onChange={(e) => setKeepLoggedIn(e.target.checked)}
                />
                Keep me logged in
              </label>
            </div>

            <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Step 1: Email (default)
  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1>Meeting Room Booking</h1>
          <p>Sign in to your account</p>
        </div>

        {error && (
          <div className="alert alert-error">
            {error}
          </div>
        )}

        <form onSubmit={handleEmailSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="Enter your email"
              autoFocus
            />
          </div>

          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? 'Checking...' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  );
}
