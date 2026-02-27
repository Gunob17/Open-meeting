import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { UserRole, User } from '../types';
import { api } from '../services/api';

const ROLES: { label: string; value: UserRole }[] = [
  { label: 'User', value: UserRole.USER },
  { label: 'Company Admin', value: UserRole.COMPANY_ADMIN },
  { label: 'Park Admin', value: UserRole.PARK_ADMIN },
  { label: 'Super Admin', value: UserRole.SUPER_ADMIN },
];

const ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.USER]: 'User',
  [UserRole.COMPANY_ADMIN]: 'Co.Admin',
  [UserRole.PARK_ADMIN]: 'ParkAdmin',
  [UserRole.SUPER_ADMIN]: 'SuperAdmin',
};

export function DevRoleWidget() {
  const {
    realUser,
    impersonatedUser, startImpersonation, stopImpersonation,
    viewAsRole, setViewAsRole, viewAsReceptionist, setViewAsReceptionist,
  } = useAuth();

  const [expanded, setExpanded] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [userFilter, setUserFilter] = useState('');
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [impersonating, setImpersonating] = useState(false);
  const [impersonateError, setImpersonateError] = useState<string | null>(null);
  const [showRoleOverride, setShowRoleOverride] = useState(false);

  // Only render in development mode and when logged in
  if (process.env.NODE_ENV !== 'development') return null;
  if (!realUser) return null;

  const isImpersonating = impersonatedUser !== null;
  const isRoleOverride = viewAsRole !== null || viewAsReceptionist;
  const isAnyOverride = isImpersonating || isRoleOverride;

  const handleExpand = async () => {
    setExpanded(true);
    if (users.length === 0) {
      setLoadingUsers(true);
      try {
        const all = await api.devGetAllUsers();
        // Exclude the real logged-in user from the list
        setUsers(all.filter((u: User) => u.id !== realUser.id));
      } catch {
        // ignore
      } finally {
        setLoadingUsers(false);
      }
    }
  };

  const handleImpersonate = async (targetUser: User) => {
    if (impersonating) return;
    setImpersonating(true);
    setImpersonateError(null);
    try {
      const { token, user } = await api.devImpersonate(targetUser.id);
      startImpersonation(token, user);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Impersonation failed';
      setImpersonateError(msg);
      console.error('Impersonation failed:', err);
    } finally {
      setImpersonating(false);
    }
  };

  const handleResetAll = () => {
    stopImpersonation();
    setViewAsRole(null);
    setViewAsReceptionist(false);
  };

  const filteredUsers = users.filter((u: User) => {
    const q = userFilter.toLowerCase();
    return (
      (u.name || '').toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q)
    );
  });

  // Collapsed badge label
  let badgeLabel = 'DEV';
  if (isImpersonating) {
    const firstName = impersonatedUser!.name?.split(' ')[0] || impersonatedUser!.email;
    badgeLabel = `IMPL · ${firstName}`;
  } else if (isRoleOverride) {
    badgeLabel = `DEV · ${viewAsRole ? ROLE_LABELS[viewAsRole] : ''}${viewAsReceptionist ? (viewAsRole ? '+R' : 'Recept.') : ''}`;
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: '1rem',
      right: '1rem',
      zIndex: 9999,
      fontFamily: 'monospace',
      fontSize: '12px',
    }}>
      {expanded ? (
        <div style={{
          background: '#1e1b4b',
          border: '1px solid #6366f1',
          borderRadius: '8px',
          padding: '12px',
          minWidth: '240px',
          maxWidth: '280px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ color: '#a5b4fc', fontWeight: 'bold', fontSize: '11px', letterSpacing: '0.05em' }}>
              DEV — VIEW AS USER
            </span>
            <button
              onClick={() => setExpanded(false)}
              style={{ background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', fontSize: '16px', lineHeight: 1, padding: 0 }}
            >
              ×
            </button>
          </div>

          {/* Section A: Impersonation */}
          {isImpersonating ? (
            <div style={{ background: '#451a03', border: '1px solid #d97706', borderRadius: '6px', padding: '8px', marginBottom: '8px' }}>
              <div style={{ color: '#fbbf24', fontSize: '11px', fontWeight: 'bold' }}>Impersonating:</div>
              <div style={{ color: '#fff', marginTop: '2px' }}>{impersonatedUser!.name || impersonatedUser!.email}</div>
              <div style={{ color: '#9ca3af', fontSize: '10px' }}>
                {impersonatedUser!.role.replace(/_/g, ' ')} · {impersonatedUser!.email}
              </div>
              <button
                onClick={() => stopImpersonation()}
                style={{
                  padding: '4px 10px', borderRadius: '4px', border: '1px solid #d97706',
                  background: 'transparent', color: '#fbbf24', cursor: 'pointer',
                  fontSize: '11px', fontFamily: 'monospace', marginTop: '6px', width: '100%',
                }}
              >
                Stop impersonating
              </button>
            </div>
          ) : (
            <>
              <div style={{ color: '#6b7280', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>
                Select user to impersonate
              </div>
              <input
                style={{
                  width: '100%', padding: '4px 6px', borderRadius: '4px',
                  border: '1px solid #4338ca', background: '#312e81', color: '#e0e7ff',
                  fontSize: '11px', fontFamily: 'monospace', boxSizing: 'border-box', marginBottom: '6px', outline: 'none',
                }}
                placeholder="Search name, email or role…"
                value={userFilter}
                onChange={e => setUserFilter(e.target.value)}
              />
              {impersonateError && (
                <div style={{ background: '#7f1d1d', border: '1px solid #dc2626', borderRadius: '4px', padding: '5px 8px', marginBottom: '6px', color: '#fca5a5', fontSize: '11px' }}>
                  {impersonateError}
                </div>
              )}
              <div style={{ maxHeight: '160px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {loadingUsers && <div style={{ color: '#6b7280', fontSize: '11px' }}>Loading users…</div>}
                {!loadingUsers && filteredUsers.length === 0 && (
                  <div style={{ color: '#6b7280', fontSize: '11px' }}>No users found</div>
                )}
                {filteredUsers.map((u: User) => (
                  <button
                    key={u.id}
                    onClick={() => handleImpersonate(u)}
                    disabled={impersonating}
                    style={{
                      padding: '5px 8px', borderRadius: '4px', border: 'none',
                      cursor: impersonating ? 'wait' : 'pointer', textAlign: 'left',
                      fontSize: '11px', fontFamily: 'monospace',
                      background: '#312e81', color: '#a5b4fc',
                    }}
                  >
                    <div style={{ color: '#e0e7ff' }}>{u.name || <em>unnamed</em>}</div>
                    <div style={{ color: '#6b7280', fontSize: '10px' }}>
                      {u.role.replace(/_/g, ' ')} · {u.email}
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Section B: Quick role override */}
          {!isImpersonating && (
            <>
              <div style={{ borderTop: '1px solid #312e81', margin: '8px 0' }} />
              <button
                onClick={() => setShowRoleOverride(v => !v)}
                style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: '11px', fontFamily: 'monospace', padding: 0 }}
              >
                {showRoleOverride ? '▲' : '▼'} Quick role override (UI only)
              </button>
              {showRoleOverride && (
                <div style={{ marginTop: '8px' }}>
                  <div style={{ color: '#6b7280', fontSize: '10px', marginBottom: '6px' }}>
                    Changes role flags only — API data reflects your real account.
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '8px' }}>
                    {ROLES.map(({ label, value }) => (
                      <button
                        key={value}
                        onClick={() => setViewAsRole(value)}
                        style={{
                          padding: '5px 10px', borderRadius: '4px', border: 'none', cursor: 'pointer',
                          textAlign: 'left', fontSize: '12px', fontFamily: 'monospace',
                          background: viewAsRole === value ? '#6366f1' : '#312e81',
                          color: viewAsRole === value ? '#fff' : '#a5b4fc',
                          fontWeight: viewAsRole === value ? 'bold' : 'normal',
                        }}
                      >
                        {viewAsRole === value ? '▶ ' : '  '}{label}
                      </button>
                    ))}
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#a5b4fc', cursor: 'pointer', marginBottom: '8px' }}>
                    <input
                      type="checkbox"
                      checked={viewAsReceptionist}
                      onChange={e => setViewAsReceptionist(e.target.checked)}
                      style={{ accentColor: '#6366f1' }}
                    />
                    + Receptionist
                  </label>
                  {isRoleOverride && (
                    <button
                      onClick={() => { setViewAsRole(null); setViewAsReceptionist(false); }}
                      style={{
                        padding: '4px 8px', borderRadius: '4px', border: '1px solid #6366f1',
                        background: 'transparent', color: '#6366f1', cursor: 'pointer',
                        fontSize: '11px', fontFamily: 'monospace',
                      }}
                    >
                      Reset role override
                    </button>
                  )}
                </div>
              )}
            </>
          )}

          {/* Footer */}
          <div style={{ borderTop: '1px solid #312e81', paddingTop: '8px', marginTop: '8px' }}>
            <div style={{ color: '#6b7280', fontSize: '10px' }}>
              Real: {realUser.name || realUser.email} ({realUser.role.replace(/_/g, ' ')})
            </div>
            {isAnyOverride && (
              <button
                onClick={handleResetAll}
                style={{
                  padding: '4px 8px', borderRadius: '4px', border: '1px solid #6366f1',
                  background: 'transparent', color: '#6366f1', cursor: 'pointer',
                  fontSize: '11px', fontFamily: 'monospace', marginTop: '4px', width: '100%',
                }}
              >
                Reset everything
              </button>
            )}
          </div>
        </div>
      ) : (
        <button
          onClick={handleExpand}
          title="Dev user switcher"
          style={{
            background: isAnyOverride ? '#6366f1' : '#1e1b4b',
            border: '1px solid #6366f1',
            color: isAnyOverride ? '#fff' : '#a5b4fc',
            borderRadius: '6px',
            padding: '4px 8px',
            cursor: 'pointer',
            fontSize: '11px',
            fontFamily: 'monospace',
            fontWeight: 'bold',
            letterSpacing: '0.05em',
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
          }}
        >
          {badgeLabel}
        </button>
      )}
    </div>
  );
}
