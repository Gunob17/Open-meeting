import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { TwoFaSetupResponse, SsoDiscoveryResult } from '../types';

type LoginStep = 'email' | 'password' | 'sso-redirect';

export function LoginPage() {
  const { t } = useTranslation();
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
      // Only display known error codes to prevent URL-based message injection
      const SSO_ERROR_MESSAGES: Record<string, string> = {
        sso_failed: t('login.errors.sso_failed'),
        email_not_found: t('login.errors.email_not_found'),
        disabled: t('login.errors.disabled'),
        domain_not_allowed: t('login.errors.domain_not_allowed'),
        config_not_found: t('login.errors.config_not_found'),
      };
      setError(SSO_ERROR_MESSAGES[ssoError] ?? t('login.errors.sso_failed'));
    }
  }, [searchParams, t]);

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
      setError(t('login.invalidEmail'));
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
          setError(err instanceof Error ? err.message : t('login.twofa.setupTitle'));
        } finally {
          setSetupLoading(false);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('login.loginFailed'));
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
      setError(err instanceof Error ? err.message : t('login.twofa.verifying'));
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
      setError(err instanceof Error ? err.message : t('login.twofa.setupTitle'));
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
            <h1>{t('login.twofa.enabledTitle')}</h1>
            <p>{t('login.twofa.backupCodesInfo')}</p>
          </div>
          <div className="backup-codes-grid">
            {backupCodes.map((code, i) => (
              <div key={i} className="backup-code">{code}</div>
            ))}
          </div>
          <p className="backup-codes-warning">
            {t('login.twofa.backupCodesWarning')}
          </p>
          <button onClick={handleBackupCodesDone} className="btn btn-primary btn-block">
            {t('login.twofa.savedCodes')}
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
            <h1>{t('login.twofa.setupTitle')}</h1>
            <p>{t('login.twofa.setupSubtitle')}</p>
          </div>

          {error && <div className="alert alert-error">{error}</div>}

          {setupLoading && <p>{t('login.twofa.loadingSetup')}</p>}

          {setupData && (
            <>
              <div className="twofa-qr-container">
                <img src={setupData.qrCodeUrl} alt="2FA QR Code" className="twofa-qr-code" />
              </div>
              <div className="twofa-secret-display">
                <label>{t('login.twofa.manualEntryKey')}</label>
                <code className="twofa-secret-code">{setupData.secret}</code>
              </div>

              <form onSubmit={handleSetupConfirm} className="login-form">
                <div className="form-group">
                  <label htmlFor="setupCode">{t('login.twofa.enterSixDigit')}</label>
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
                  {loading ? t('login.twofa.verifying') : t('login.twofa.verifyAndEnable')}
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
            <h1>{t('login.twofa.title')}</h1>
            <p>{t('login.twofa.subtitle')}</p>
          </div>

          {error && <div className="alert alert-error">{error}</div>}

          <form onSubmit={handleVerifySubmit} className="login-form">
            <div className="form-group">
              <label htmlFor="twofaCode">{t('login.twofa.verificationCode')}</label>
              <input
                type="text"
                id="twofaCode"
                value={twofaCode}
                onChange={(e) => setTwofaCode(e.target.value.replace(/[^a-fA-F0-9]/g, '').slice(0, 8))}
                required
                placeholder={t('login.twofa.enterCode')}
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
                {t('login.twofa.trustDevice')}
              </label>
            </div>

            <button type="submit" className="btn btn-primary btn-block" disabled={loading || twofaCode.length < 6}>
              {loading ? t('login.twofa.verifying') : t('login.twofa.verify')}
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
            <h1>{t('login.redirecting')}</h1>
            <p>{t('login.takingYouTo', { provider: ssoInfo?.displayName || 'your identity provider' })}</p>
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
            {t('login.cancel')}
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
            <h1>{t('login.title')}</h1>
            <p>{t('login.enterPassword')}</p>
          </div>

          {error && (
            <div className="alert alert-error">
              {error}
            </div>
          )}

          <div className="login-email-display" onClick={handleBack}>
            <span className="login-email-text">{email}</span>
            <span className="login-email-change">{t('login.change')}</span>
          </div>

          <form onSubmit={handleCredentialSubmit} className="login-form">
            <div className="form-group">
              <label htmlFor="password">{t('login.password')}</label>
              <input
                ref={passwordRef}
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder={t('login.passwordPlaceholder')}
              />
            </div>

            <div className="form-group keep-logged-in">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={keepLoggedIn}
                  onChange={(e) => setKeepLoggedIn(e.target.checked)}
                />
                {t('login.keepLoggedIn')}
              </label>
            </div>

            <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
              {loading ? t('login.signingIn') : t('login.signIn')}
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
          <h1>{t('login.title')}</h1>
          <p>{t('login.subtitle')}</p>
        </div>

        {error && (
          <div className="alert alert-error">
            {error}
          </div>
        )}

        <form onSubmit={handleEmailSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="email">{t('login.email')}</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder={t('login.emailPlaceholder')}
              autoFocus
            />
          </div>

          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? t('login.checking') : t('login.continue')}
          </button>
        </form>
      </div>
    </div>
  );
}
