import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { TourProvider } from '../context/TourContext';
import { TourGuide } from './TourGuide';
import { getStepsForRole } from '../tour/tourSteps';
import { api } from '../services/api';
import { Park, Settings } from '../types';
import { DevRoleWidget } from './DevRoleWidget';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { user, logout, isAdmin, isCompanyAdmin, isSuperAdmin, isReceptionist, impersonatedUser, viewAsRole, viewAsReceptionist } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [parks, setParks] = useState<Park[]>([]);
  const [selectedParkId, setSelectedParkId] = useState<string>('');
  const [currentPark, setCurrentPark] = useState<Park | null>(null);

  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const [parkDropdownOpen, setParkDropdownOpen] = useState(false);
  const parkDropdownRef = useRef<HTMLDivElement>(null);

  // Sidebar state - open by default on desktop
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    const stored = localStorage.getItem('sidebarOpen');
    if (stored !== null) return stored === 'true';
    return window.innerWidth > 768;
  });

  // System banner
  const [settings, setSettings] = useState<Settings | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Guided tour
  const [runTour, setRunTour] = useState(false);

  useEffect(() => {
    loadParks();
  }, []);

  // Fetch settings for banner (only when logged in)
  useEffect(() => {
    if (!user) return;
    api.getSettings().then(s => setSettings(s)).catch(() => {});
  }, [user]);

  // Auto-start tour for users who haven't seen it
  useEffect(() => {
    if (user && user.hasSeenTour === false) {
      // Small delay so the layout has rendered its nav elements
      const t = setTimeout(() => setRunTour(true), 800);
      return () => clearTimeout(t);
    }
  }, [user]);

  // Compute banner active state
  const isBannerActive = !!(
    settings?.bannerEnabled &&
    (!settings.bannerStartsAt || new Date() >= new Date(settings.bannerStartsAt)) &&
    (!settings.bannerEndsAt || new Date() <= new Date(settings.bannerEndsAt))
  );

  // Dismiss key changes when banner content changes → resets dismissal automatically
  const bannerDismissKey = `banner_dismissed_${settings?.bannerStartsAt ?? 'always'}_${(settings?.bannerMessage ?? '').slice(0, 32)}`;

  useEffect(() => {
    if (isBannerActive) {
      setBannerDismissed(sessionStorage.getItem(bannerDismissKey) === 'true');
    }
  }, [isBannerActive, bannerDismissKey]);

  const handleBannerDismiss = () => {
    sessionStorage.setItem(bannerDismissKey, 'true');
    setBannerDismissed(true);
  };

  const handleTourFinish = useCallback(() => {
    setRunTour(false);
    api.tourComplete().catch(() => {});
  }, []);

  const startTour = useCallback(() => {
    setRunTour(true);
  }, []);

  useEffect(() => {
    const storedParkId = localStorage.getItem('selectedParkId');
    if (isSuperAdmin && storedParkId) {
      setSelectedParkId(storedParkId);
    } else if (user?.parkId) {
      setSelectedParkId(user.parkId);
    } else if (parks.length > 0) {
      setSelectedParkId(parks[0].id);
    }
  }, [user, parks, isSuperAdmin]);

  useEffect(() => {
    if (selectedParkId && parks.length > 0) {
      const park = parks.find(p => p.id === selectedParkId);
      setCurrentPark(park || null);
    }
  }, [selectedParkId, parks]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 768 && sidebarOpen) {
        const stored = localStorage.getItem('sidebarOpen');
        if (stored === null) setSidebarOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [sidebarOpen]);

  useEffect(() => {
    if (window.innerWidth <= 768) setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!userMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [userMenuOpen]);

  useEffect(() => {
    if (!parkDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (parkDropdownRef.current && !parkDropdownRef.current.contains(e.target as Node)) {
        setParkDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [parkDropdownOpen]);

  const loadParks = async () => {
    try {
      const data = await api.getParks();
      setParks(data);
    } catch (error) {
      console.error('Failed to load parks:', error);
    }
  };

  const handleParkChange = (parkId: string) => {
    setSelectedParkId(parkId);
    localStorage.setItem('selectedParkId', parkId);
    window.location.reload();
  };

  const handleLogout = () => {
    localStorage.removeItem('selectedParkId');
    logout();
    navigate('/login');
  };

  const toggleSidebar = () => {
    const newState = !sidebarOpen;
    setSidebarOpen(newState);
    localStorage.setItem('sidebarOpen', String(newState));
  };

  const isActive = (path: string) => location.pathname === path;

  const tourSteps = getStepsForRole(user?.role ?? 'user');

  return (
    <TourProvider startTour={startTour}>
      <div className="app-layout">
        {/* Guided tour overlay */}
        <TourGuide steps={tourSteps} run={runTour} onFinish={handleTourFinish} />

        {/* Sidebar */}
        <aside className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
          <div className="sidebar-header">
            <Link to="/" className="sidebar-logo">
              {currentPark?.logoUrl ? (
                <img src={currentPark.logoUrl} alt={currentPark.name} className="logo-image" />
              ) : (
                <>
                  <span className="logo-icon">OM</span>
                  <span className="logo-text">Open Meeting</span>
                </>
              )}
            </Link>
            <button className="sidebar-toggle" onClick={toggleSidebar} aria-label="Toggle sidebar">
              <span className="toggle-icon">{sidebarOpen ? '\u2039' : '\u203A'}</span>
            </button>
          </div>

          <nav className="sidebar-nav">
            {!isSuperAdmin && (currentPark?.name || parks[0]?.name) && (
              <div className="sidebar-park-display" title={currentPark?.name || parks[0]?.name}>
                <span className="sidebar-park-display-name">{currentPark?.name || parks[0]?.name}</span>
              </div>
            )}

            {isSuperAdmin && parks.length > 0 && (
              <div className="sidebar-section">
                <span className="sidebar-section-label">Park</span>
                <div className="park-select-wrapper" ref={parkDropdownRef} data-tour="park-select">
                  <button
                    className="park-select-btn"
                    onClick={() => setParkDropdownOpen(o => !o)}
                    title={parks.find(p => p.id === selectedParkId)?.name ?? 'Select Park'}
                  >
                    <span className="park-select-name">
                      {parks.find(p => p.id === selectedParkId)?.name ?? 'Select Park'}
                    </span>
                    <span className="park-select-chevron">{parkDropdownOpen ? '▴' : '▾'}</span>
                  </button>
                  {parkDropdownOpen && (
                    <ul className="park-dropdown-list">
                      {parks.map(park => (
                        <li key={park.id}>
                          <button
                            className={`park-dropdown-item${park.id === selectedParkId ? ' active' : ''}`}
                            onClick={() => { setParkDropdownOpen(false); handleParkChange(park.id); }}
                            title={park.name}
                          >
                            {park.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}

            <div className="sidebar-section">
              <span className="sidebar-section-label">Navigation</span>
              <ul className="sidebar-menu">
                <li>
                  <Link to="/" className={`sidebar-link ${isActive('/') ? 'active' : ''}`} data-tour="nav-calendar">
                    <span className="link-icon">&#128197;</span>
                    <span className="link-text">Calendar</span>
                  </Link>
                </li>
                <li>
                  <Link to="/rooms" className={`sidebar-link ${isActive('/rooms') ? 'active' : ''}`} data-tour="nav-rooms">
                    <span className="link-icon">&#127970;</span>
                    <span className="link-text">Rooms</span>
                  </Link>
                </li>
                <li>
                  <Link to="/my-bookings" className={`sidebar-link ${isActive('/my-bookings') ? 'active' : ''}`} data-tour="nav-my-bookings">
                    <span className="link-icon">&#128203;</span>
                    <span className="link-text">My Bookings</span>
                  </Link>
                </li>
              </ul>
            </div>

            {isCompanyAdmin && (
              <div className="sidebar-section">
                <span className="sidebar-section-label">Management</span>
                <ul className="sidebar-menu">
                  <li>
                    <Link to="/users" className={`sidebar-link ${isActive('/users') ? 'active' : ''}`} data-tour="nav-users">
                      <span className="link-icon">&#128101;</span>
                      <span className="link-text">Users</span>
                    </Link>
                  </li>
                  {user?.companyId && !isAdmin && (
                    <>
                      <li>
                        <Link to={`/admin/ldap/${user.companyId}`} className={`sidebar-link ${location.pathname.startsWith('/admin/ldap') ? 'active' : ''}`} data-tour="nav-ldap">
                          <span className="link-icon">&#128272;</span>
                          <span className="link-text">LDAP Settings</span>
                        </Link>
                      </li>
                      <li>
                        <Link to={`/admin/sso/${user.companyId}`} className={`sidebar-link ${location.pathname.startsWith('/admin/sso') ? 'active' : ''}`} data-tour="nav-sso">
                          <span className="link-icon">&#128273;</span>
                          <span className="link-text">SSO Settings</span>
                        </Link>
                      </li>
                    </>
                  )}
                </ul>
              </div>
            )}

            {isReceptionist && (
              <div className="sidebar-section">
                <span className="sidebar-section-label">Reception</span>
                <ul className="sidebar-menu">
                  <li>
                    <Link to="/reception" className={`sidebar-link ${isActive('/reception') ? 'active' : ''}`} data-tour="nav-reception">
                      <span className="link-icon">&#128717;</span>
                      <span className="link-text">Guest Management</span>
                    </Link>
                  </li>
                </ul>
              </div>
            )}

            {isAdmin && (
              <div className="sidebar-section">
                <span className="sidebar-section-label">Administration</span>
                <ul className="sidebar-menu">
                  <li>
                    <Link to="/admin/rooms" className={`sidebar-link ${isActive('/admin/rooms') ? 'active' : ''}`} data-tour="nav-admin-rooms">
                      <span className="link-icon">&#128736;</span>
                      <span className="link-text">Manage Rooms</span>
                    </Link>
                  </li>
                  <li>
                    <Link to="/admin/devices" className={`sidebar-link ${isActive('/admin/devices') ? 'active' : ''}`} data-tour="nav-admin-devices">
                      <span className="link-icon">&#128187;</span>
                      <span className="link-text">Devices</span>
                    </Link>
                  </li>
                  <li>
                    <Link to="/admin/companies" className={`sidebar-link ${isActive('/admin/companies') ? 'active' : ''}`} data-tour="nav-admin-companies">
                      <span className="link-icon">&#127970;</span>
                      <span className="link-text">Companies</span>
                    </Link>
                  </li>
                  <li>
                    <Link to="/admin/statistics" className={`sidebar-link ${isActive('/admin/statistics') ? 'active' : ''}`} data-tour="nav-admin-statistics">
                      <span className="link-icon">&#128202;</span>
                      <span className="link-text">Statistics</span>
                    </Link>
                  </li>
                  <li>
                    <Link to="/admin/settings" className={`sidebar-link ${isActive('/admin/settings') ? 'active' : ''}`} data-tour="nav-admin-settings">
                      <span className="link-icon">&#9881;</span>
                      <span className="link-text">Settings</span>
                    </Link>
                  </li>
                  {isSuperAdmin && (
                    <li>
                      <Link to="/admin/parks" className={`sidebar-link ${isActive('/admin/parks') ? 'active' : ''}`} data-tour="nav-admin-parks">
                        <span className="link-icon">&#127795;</span>
                        <span className="link-text">Parks</span>
                      </Link>
                    </li>
                  )}
                </ul>
              </div>
            )}
          </nav>

          <div className="sidebar-footer" ref={userMenuRef}>
            {userMenuOpen && (
              <div className="user-menu-dropdown">
                <Link
                  to="/account/settings"
                  className="user-menu-item"
                  onClick={() => setUserMenuOpen(false)}
                >
                  <span className="link-icon">&#9881;&#65039;</span>
                  <span className="link-text">Settings</span>
                </Link>
                <button onClick={handleLogout} className="user-menu-item user-menu-item--logout">
                  <span className="link-icon">&#10145;</span>
                  <span className="link-text">Logout</span>
                </button>
              </div>
            )}
            <button
              className="user-info user-info-btn"
              onClick={() => setUserMenuOpen(o => !o)}
              aria-expanded={userMenuOpen}
              aria-haspopup="true"
              title="Account menu"
              data-tour="user-menu"
            >
              <div className="user-avatar">
                {user?.name?.charAt(0).toUpperCase()}
              </div>
              <div className="user-details">
                <span className="user-name">{user?.name}</span>
                <span className="user-role">{user?.role.replace(/_/g, ' ')}</span>
              </div>
              <span className="user-menu-chevron">{userMenuOpen ? '▲' : '▼'}</span>
            </button>
          </div>
        </aside>

        {/* Mobile overlay */}
        {sidebarOpen && <div className="sidebar-overlay" onClick={toggleSidebar}></div>}

        {/* Main content */}
        <div className={`main-wrapper ${sidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
          {/* Top bar for mobile */}
          <header className="top-bar">
            <button className="mobile-menu-btn" onClick={toggleSidebar} aria-label="Open menu">
              <span className="hamburger-line"></span>
              <span className="hamburger-line"></span>
              <span className="hamburger-line"></span>
            </button>
            <span className="top-bar-title">Open Meeting</span>
          </header>

          {/* System banner */}
          {isBannerActive && !bannerDismissed && (
            <div className={`system-banner system-banner--${settings?.bannerLevel ?? 'info'}`} role="alert">
              <span className="system-banner-message">{settings?.bannerMessage}</span>
              <button
                className="system-banner-dismiss"
                onClick={handleBannerDismiss}
                aria-label="Dismiss banner"
                title="Dismiss"
              >
                &times;
              </button>
            </div>
          )}

          {/* Dev mode: impersonation / view-as banner */}
          {process.env.NODE_ENV === 'development' && impersonatedUser && (
            <div style={{
              background: '#d97706',
              color: '#fff',
              textAlign: 'center',
              padding: '4px 12px',
              fontSize: '12px',
              fontFamily: 'monospace',
              fontWeight: 'bold',
              letterSpacing: '0.03em',
            }}>
              DEV: Impersonating {impersonatedUser.name || impersonatedUser.email} ({impersonatedUser.role.replace(/_/g, ' ')}) — API data is scoped to this user
            </div>
          )}
          {process.env.NODE_ENV === 'development' && !impersonatedUser && (viewAsRole !== null || viewAsReceptionist) && (
            <div style={{
              background: '#d97706',
              color: '#fff',
              textAlign: 'center',
              padding: '4px 12px',
              fontSize: '12px',
              fontFamily: 'monospace',
              fontWeight: 'bold',
              letterSpacing: '0.03em',
            }}>
              DEV: Viewing as {viewAsRole ? viewAsRole.replace(/_/g, ' ') : user?.role?.replace(/_/g, ' ')}
              {viewAsReceptionist ? ' + receptionist' : ''} — affects UI only, not API data
            </div>
          )}

          <main className="main-content">
            {children}
          </main>
        </div>

        <DevRoleWidget />
      </div>
    </TourProvider>
  );
}
