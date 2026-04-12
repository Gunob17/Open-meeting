import React, { useState, useRef, useCallback } from 'react';
import { api } from '../services/api';
import { Company, UserRole } from '../types';
import { parseCsvText, validateRows, generateCsvTemplate, ParsedRow } from '../utils/csvParser';

type ImportStep = 'input' | 'review' | 'results';
type InputMethod = 'upload' | 'paste' | 'manual';

interface ImportResult {
  email: string;
  status: 'created' | 'skipped';
  error?: string;
  userId?: string;
  companyCreated?: boolean;
}

interface Props {
  companies: Company[];
  currentUserCompanyId: string;
  currentUserCompanyName: string;
  isAdmin: boolean; // park admin or above
  onClose: () => void;
  onComplete: () => void;
}

const MAX_ROWS = 50;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function emptyRow(): ParsedRow {
  return { email: '', role: UserRole.USER, companyId: '', companyName: '', errors: [] };
}

/** Derive a short company name from an email address by stripping the TLD.
 *  john@acme.com → "acme"
 *  jane@bigcorp.co.uk → "bigcorp"
 */
function companyNameFromEmail(email: string): string {
  const at = email.indexOf('@');
  if (at < 0) return '';
  const parts = email.slice(at + 1).toLowerCase().split('.');
  // Country-code TLDs like co.uk, org.au: last part is 2 chars and second-to-last is ≤3 chars
  if (parts.length >= 3 && parts[parts.length - 1].length === 2 && parts[parts.length - 2].length <= 3) {
    return parts[parts.length - 3];
  }
  // Standard TLD (e.g. .com, .org, .io): return the label just before the TLD
  return parts.length >= 2 ? parts[parts.length - 2] : parts[0];
}

export function BulkImportModal({
  companies, currentUserCompanyId, currentUserCompanyName, isAdmin, onClose, onComplete,
}: Props) {
  const [step, setStep] = useState<ImportStep>('input');
  const [method, setMethod] = useState<InputMethod>('upload');
  const [pasteText, setPasteText] = useState('');
  const [manualRows, setManualRows] = useState<ParsedRow[]>([emptyRow(), emptyRow(), emptyRow()]);
  const [reviewRows, setReviewRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [fileText, setFileText] = useState('');
  const [parsedCount, setParsedCount] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [resultCreated, setResultCreated] = useState(0);
  const [resultSkipped, setResultSkipped] = useState(0);
  const [showErrors, setShowErrors] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Global role + company selectors (park admins only)
  const [globalRole, setGlobalRole] = useState<UserRole>(UserRole.USER);
  const [globalCompanyId, setGlobalCompanyId] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Apply global role + company to a row, deriving company from email domain for company_admin
  const applyGlobal = useCallback((row: ParsedRow): ParsedRow => {
    if (!isAdmin) {
      return { ...row, role: UserRole.USER, companyId: currentUserCompanyId, companyName: '' };
    }
    if (globalRole === UserRole.COMPANY_ADMIN) {
      const companyName = companyNameFromEmail(row.email);
      return { ...row, role: globalRole, companyId: '', companyName };
    }
    return { ...row, role: globalRole, companyId: globalCompanyId, companyName: '' };
  }, [isAdmin, currentUserCompanyId, globalRole, globalCompanyId]);

  const revalidateRow = useCallback((row: ParsedRow): ParsedRow => {
    const errors: string[] = [];
    if (!row.email) errors.push('Email is required');
    else if (!EMAIL_REGEX.test(row.email.toLowerCase())) errors.push('Invalid email format');
    if (isAdmin && row.role !== UserRole.COMPANY_ADMIN && !row.companyId) {
      errors.push('Company is required');
    }
    return { ...row, errors };
  }, [isAdmin]);

  const processEmailsIntoReview = useCallback((raw: ParsedRow[]) => {
    const applied = validateRows(raw.map(r => revalidateRow(applyGlobal(r))));
    setReviewRows(applied.slice(0, MAX_ROWS));
    setParsedCount(applied.length);
    setStep('review');
  }, [applyGlobal, revalidateRow]);

  // ── File upload ──

  const handleFileChange = (file: File | null) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) { alert('Please upload a .csv file'); return; }
    if (file.size > 50 * 1024) { alert('File must be under 50 KB'); return; }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = e => setFileText(e.target?.result as string ?? '');
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFileChange(e.dataTransfer.files[0] ?? null);
  };

  // ── Step navigation ──

  const handleNextFromInput = () => {
    if (isAdmin && globalRole !== UserRole.COMPANY_ADMIN && !globalCompanyId) {
      alert('Please select a company before continuing.');
      return;
    }
    if (method === 'upload') {
      processEmailsIntoReview(parseCsvText(fileText));
    } else if (method === 'paste') {
      processEmailsIntoReview(parseCsvText(pasteText));
    } else {
      processEmailsIntoReview(manualRows.filter(r => r.email.trim() !== ''));
    }
  };

  const updateReviewEmail = (index: number, email: string) => {
    setReviewRows(prev => {
      const copy = [...prev];
      copy[index] = revalidateRow(applyGlobal({ ...copy[index], email }));
      return validateRows(copy);
    });
  };

  // ── Submit ──

  const handleSubmit = async () => {
    const validRows = reviewRows.filter(r => r.errors.length === 0);
    if (validRows.length === 0) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const payload = validRows.map(r => ({
        email: r.email.toLowerCase().trim(),
        role: r.role,
        ...(r.companyId ? { companyId: r.companyId } : {}),
        ...(r.companyName ? { companyName: r.companyName } : {}),
      }));
      const response = await api.bulkImportUsers(payload);
      setResults(response.results);
      setResultCreated(response.created);
      setResultSkipped(response.skipped);
      setStep('results');
      if (response.created > 0) onComplete();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Import failed — please try again');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadTemplate = () => {
    const content = generateCsvTemplate();
    const blob = new Blob([content], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'bulk-import-template.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const handleReset = () => {
    setStep('input'); setMethod('upload'); setPasteText('');
    setManualRows([emptyRow(), emptyRow(), emptyRow()]);
    setReviewRows([]); setFileName(''); setFileText('');
    setResults([]); setSubmitError(''); setShowErrors(false);
  };

  // ── Derived counts ──

  const validCount = reviewRows.filter(r => r.errors.length === 0).length;
  const errorCount = reviewRows.filter(r => r.errors.length > 0).length;

  const newCompanyDomains = [...new Set(
    reviewRows
      .filter(r => r.errors.length === 0 && r.role === UserRole.COMPANY_ADMIN && r.companyName)
      .map(r => r.companyName)
      .filter(d => !companies.some(c => c.name.toLowerCase() === d.toLowerCase()))
  )];

  const newCompanyCount = results.filter(r => r.companyCreated).length;
  const failedResults = results.filter(r => r.status === 'skipped');

  const getCompanyDisplay = (row: ParsedRow): { label: string; isNew: boolean } => {
    if (!isAdmin) return { label: currentUserCompanyName, isNew: false };
    if (row.role === UserRole.COMPANY_ADMIN) {
      const exists = companies.some(c => c.name.toLowerCase() === row.companyName.toLowerCase());
      return { label: row.companyName || '—', isNew: !!row.companyName && !exists };
    }
    return { label: companies.find(c => c.id === row.companyId)?.name ?? '—', isNew: false };
  };

  const steps: { key: ImportStep; label: string }[] = [
    { key: 'input', label: 'Input Data' },
    { key: 'review', label: 'Review' },
    { key: 'results', label: 'Results' },
  ];
  const stepIndex = steps.findIndex(s => s.key === step);

  const globalRoleLabel = globalRole === UserRole.COMPANY_ADMIN ? 'Company Admin'
    : globalRole === UserRole.PARK_ADMIN ? 'Park Admin' : 'User';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-bulk" onClick={e => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-labelledby="bulk-import-title">

        {/* Header */}
        <div className="modal-header">
          <h2 id="bulk-import-title">Import Multiple Users</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {/* Step indicator */}
        <div className="bulk-import-steps" role="list">
          {steps.map((s, i) => {
            const isComplete = i < stepIndex;
            const isActive = i === stepIndex;
            return (
              <React.Fragment key={s.key}>
                <div
                  className={`bulk-import-step${isActive ? ' bulk-import-step--active' : ''}${isComplete ? ' bulk-import-step--complete' : ''}`}
                  role="listitem" aria-current={isActive ? 'step' : undefined}>
                  <div className="bulk-import-step__circle">{isComplete ? '✓' : i + 1}</div>
                  <span className="bulk-import-step__label">{s.label}</span>
                </div>
                {i < steps.length - 1 && (
                  <div className={`bulk-import-step-connector${i < stepIndex ? ' bulk-import-step-connector--done' : ''}`} />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Body */}
        <div className="modal-body">
          <div aria-live="polite" className="sr-only" />

          {/* ── Step 1: Input ── */}
          {step === 'input' && (
            <>
              {/* Park admin: role + company selectors */}
              {isAdmin && (
                <div className="bulk-import-settings">
                  <div className="form-group form-group--inline">
                    <label htmlFor="globalRole">Import all as</label>
                    <select
                      id="globalRole"
                      value={globalRole}
                      onChange={e => { setGlobalRole(e.target.value as UserRole); setGlobalCompanyId(''); }}>
                      <option value={UserRole.USER}>User</option>
                      <option value={UserRole.COMPANY_ADMIN}>Company Admin</option>
                      <option value={UserRole.PARK_ADMIN}>Park Admin</option>
                    </select>
                  </div>

                  {globalRole === UserRole.COMPANY_ADMIN ? (
                    <p className="bulk-import-hint" style={{ margin: '0.25rem 0 0' }}>
                      Each user's company will be auto-created from their email domain —
                      e.g. <code>john@acme.com</code> → company <code>acme</code>.
                      Admins complete company details on first login.
                    </p>
                  ) : (
                    <div className="form-group form-group--inline">
                      <label htmlFor="globalCompany">Company</label>
                      <select
                        id="globalCompany"
                        value={globalCompanyId}
                        onChange={e => setGlobalCompanyId(e.target.value)}>
                        <option value="">Select company…</option>
                        {companies.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {!isAdmin && (
                <div className="bulk-import-banner">
                  Users will be added to <strong>{currentUserCompanyName}</strong> as regular users.
                </div>
              )}

              <div className="tab-nav" role="tablist">
                {(['upload', 'paste', 'manual'] as InputMethod[]).map(m => (
                  <button key={m} role="tab"
                    className={`tab-btn${method === m ? ' tab-btn--active' : ''}`}
                    onClick={() => setMethod(m)} aria-selected={method === m}>
                    {m === 'upload' ? 'Upload CSV' : m === 'paste' ? 'Paste Emails' : 'Enter Manually'}
                  </button>
                ))}
              </div>

              {method === 'upload' && (
                <div>
                  <div
                    className={`csv-drop-zone${dragOver ? ' csv-drop-zone--active' : ''}`}
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    role="button" tabIndex={0}
                    onKeyDown={e => e.key === 'Enter' && fileInputRef.current?.click()}
                    aria-label="CSV file drop zone">
                    {fileName ? (
                      <div className="csv-file-chip">
                        <span>📄 {fileName}</span>
                        <button className="btn btn-small btn-secondary"
                          onClick={e => { e.stopPropagation(); setFileName(''); setFileText(''); }}
                          aria-label="Remove file">×</button>
                      </div>
                    ) : (
                      <>
                        <div className="csv-drop-zone__icon">↑</div>
                        <p>Drag and drop your CSV here, or click to browse</p>
                        <span className="btn btn-small btn-secondary" style={{ pointerEvents: 'none' }}>Browse file</span>
                      </>
                    )}
                  </div>
                  <input ref={fileInputRef} type="file" accept=".csv" style={{ display: 'none' }}
                    onChange={e => handleFileChange(e.target.files?.[0] ?? null)} />
                  <p className="bulk-import-hint">
                    One email per row. &nbsp;
                    <button className="btn-link" onClick={handleDownloadTemplate}>Download template</button>
                  </p>
                </div>
              )}

              {method === 'paste' && (
                <div>
                  <textarea className="bulk-import-paste" value={pasteText}
                    onChange={e => setPasteText(e.target.value)}
                    placeholder={'john@acme.com\njane@bigcorp.com\nbob@startup.io'}
                    aria-label="Paste email addresses" />
                  <p className="bulk-import-hint">One email per line. Header row optional.</p>
                </div>
              )}

              {method === 'manual' && (
                <div>
                  <div className="bulk-import-table-wrap">
                    <table className="bulk-import-manual-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Email *</th>
                          <th aria-label="Remove" />
                        </tr>
                      </thead>
                      <tbody>
                        {manualRows.map((row, i) => (
                          <tr key={i}>
                            <td className="bulk-import-manual-table__num">{i + 1}</td>
                            <td>
                              <input type="email" className="manual-entry-input" value={row.email}
                                onChange={e => {
                                  const u = [...manualRows];
                                  u[i] = { ...u[i], email: e.target.value };
                                  setManualRows(u);
                                }}
                                placeholder="email@example.com"
                                aria-label={`Row ${i + 1} email`} />
                            </td>
                            <td>
                              <button className="btn btn-small btn-danger"
                                onClick={() => setManualRows(prev => prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev)}
                                aria-label={`Remove row ${i + 1}`}
                                disabled={manualRows.length === 1}>×</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {manualRows.length < MAX_ROWS && (
                    <button className="btn btn-small btn-secondary" style={{ marginTop: 'var(--space-3)' }}
                      onClick={() => setManualRows(prev => [...prev, emptyRow()])}>+ Add Row</button>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── Step 2: Review ── */}
          {step === 'review' && (
            <>
              <div className="bulk-import-summary">
                <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-gray-500)' }}>
                  {parsedCount} email{parsedCount !== 1 ? 's' : ''} parsed
                  {parsedCount > MAX_ROWS ? ` — showing first ${MAX_ROWS}` : ''}
                </span>
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  {validCount > 0 && <span className="role-badge" style={{ background: 'var(--color-success-light)', color: 'var(--color-success-hover)' }}>{validCount} valid</span>}
                  {errorCount > 0 && <span className="role-badge" style={{ background: 'var(--color-danger-light)', color: 'var(--color-danger-hover)' }}>{errorCount} errors</span>}
                </div>
              </div>

              <div className="bulk-import-banner" style={{ marginBottom: 'var(--space-4)' }}>
                {isAdmin ? (
                  <>
                    Role: <strong>{globalRoleLabel}</strong>
                    {globalRole === UserRole.COMPANY_ADMIN
                      ? ' — company derived from each email domain'
                      : ` — ${companies.find(c => c.id === globalCompanyId)?.name ?? ''}`}
                  </>
                ) : (
                  <>All users will be added to <strong>{currentUserCompanyName}</strong> as regular users.</>
                )}
              </div>

              <div className="bulk-import-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Email</th>
                      {isAdmin && <th>Company</th>}
                      <th aria-label="Remove" />
                    </tr>
                  </thead>
                  <tbody>
                    {reviewRows.map((row, i) => {
                      const hasError = row.errors.length > 0;
                      const { label, isNew } = getCompanyDisplay(row);
                      return (
                        <tr key={i} className={hasError ? 'row-error' : ''}>
                          <td style={{ width: '1%', whiteSpace: 'nowrap' }}>
                            {hasError
                              ? <span style={{ color: 'var(--color-danger-hover)', fontSize: 'var(--font-size-xs)' }}>✕ {row.errors[0]}</span>
                              : <span style={{ color: 'var(--color-success)', fontSize: 'var(--font-size-xs)' }}>✓</span>
                            }
                          </td>
                          <td>
                            <input type="email"
                              className={`manual-entry-input${hasError ? ' input-error' : ''}`}
                              value={row.email}
                              onChange={e => updateReviewEmail(i, e.target.value.toLowerCase())}
                              aria-label={`Row ${i + 1} email`} />
                          </td>
                          {isAdmin && (
                            <td style={{ fontSize: 'var(--font-size-sm)', whiteSpace: 'nowrap' }}>
                              {isNew && (
                                <span className="role-badge" style={{ marginRight: 'var(--space-1)', background: 'var(--color-warning-light)', color: 'var(--color-warning-hover)' }}>New</span>
                              )}
                              {label}
                            </td>
                          )}
                          <td>
                            <button className="btn btn-small btn-danger"
                              onClick={() => setReviewRows(prev => validateRows(prev.filter((_, idx) => idx !== i)))}
                              aria-label={`Remove row ${i + 1}`}>×</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {isAdmin && newCompanyDomains.length > 0 && (
                <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-warning-hover)', marginTop: 'var(--space-3)' }}>
                  ⚠ {newCompanyDomains.length} new compan{newCompanyDomains.length === 1 ? 'y' : 'ies'} will be created.
                  Admins will be prompted to complete company details on first login.
                </p>
              )}

              {submitError && (
                <div className="alert alert-error" style={{ marginTop: 'var(--space-4)' }}>{submitError}</div>
              )}
            </>
          )}

          {/* ── Step 3: Results ── */}
          {step === 'results' && (
            <div className="bulk-import-results">
              <div className="results-hero">
                <div className="results-hero__number"
                  style={{ color: resultCreated > 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                  {resultCreated}
                </div>
                <div className="results-hero__label">
                  {resultCreated === 1 ? 'invitation sent' : 'invitations sent'}
                </div>
                {resultSkipped > 0 && (
                  <div style={{ marginTop: 'var(--space-2)', fontSize: 'var(--font-size-sm)', color: 'var(--color-danger-hover)' }}>
                    {resultSkipped} row{resultSkipped !== 1 ? 's' : ''} skipped
                  </div>
                )}
              </div>

              {newCompanyCount > 0 && (
                <div className="bulk-import-banner" style={{ textAlign: 'left', marginBottom: 'var(--space-4)' }}>
                  <strong>{newCompanyCount} new compan{newCompanyCount === 1 ? 'y was' : 'ies were'} created.</strong>
                  {' '}Invited admins will be prompted to complete their company profile on first login.
                </div>
              )}

              {resultCreated > 0 && (
                <p style={{ textAlign: 'center', fontSize: 'var(--font-size-sm)', color: 'var(--color-gray-500)', marginBottom: 'var(--space-4)' }}>
                  Invitation emails dispatched. Users appear with "invite pending" until they complete setup.
                </p>
              )}

              {failedResults.length > 0 && (
                <div>
                  <button className="btn btn-small btn-secondary" onClick={() => setShowErrors(v => !v)}>
                    {showErrors ? '▾ Hide' : '▸ Show'} {failedResults.length} skipped row{failedResults.length !== 1 ? 's' : ''}
                  </button>
                  {showErrors && (
                    <div className="results-error-list">
                      {failedResults.map((r, i) => (
                        <div key={i} style={{ padding: 'var(--space-2) 0', borderBottom: 'var(--border)', fontSize: 'var(--font-size-sm)' }}>
                          <strong>{r.email}</strong>
                          <span style={{ color: 'var(--color-gray-500)', marginLeft: 'var(--space-2)' }}>
                            — {r.error === 'already_exists' ? 'Email already registered' : r.error}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          {step === 'input' && (
            <>
              <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" onClick={handleNextFromInput}
                disabled={
                  (method === 'paste' && !pasteText.trim()) ||
                  (method === 'manual' && !manualRows.some(r => r.email.trim())) ||
                  (method === 'upload' && !fileName)
                }>
                Preview &amp; Validate →
              </button>
            </>
          )}
          {step === 'review' && (
            <>
              <button className="btn btn-secondary" onClick={() => setStep('input')}>← Back</button>
              {errorCount > 0 && (
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-danger-hover)', alignSelf: 'center', marginRight: 'auto', marginLeft: 'var(--space-4)' }}>
                  {errorCount} row{errorCount !== 1 ? 's' : ''} with errors will be skipped
                </span>
              )}
              <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting || validCount === 0}>
                {submitting ? 'Importing…' : `Import ${validCount} User${validCount !== 1 ? 's' : ''}`}
              </button>
            </>
          )}
          {step === 'results' && (
            <>
              <button className="btn btn-secondary" onClick={handleReset}>Import More Users</button>
              <button className="btn btn-primary" onClick={onClose}>Done</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
