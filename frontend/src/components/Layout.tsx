import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { Park } from '../types';
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

  // Sidebar state - open by default on desktop
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    const stored = localStorage.getItem('sidebarOpen');
    if (stored !== null) return stored === 'true';
    // Default: open on desktop (width > 768px), closed on mobile
    return window.innerWidth > 768;
  });

  useEffect(() => {
    loadParks();
  }, []);

  useEffect(() => {
    // Load selected park from localStorage or use user's park
    const storedParkId = localStorage.getItem('selectedParkId');
    if (isSuperAdmin && storedParkId) {
      setSelectedParkId(storedParkId);
    } else if (user?.parkId) {
      setSelectedParkId(user.parkId);
    } else if (parks.length > 0) {
      setSelectedParkId(parks[0].id);
    }
  }, [user, parks, isSuperAdmin]);

  // Load current park details when selectedParkId changes
  useEffect(() => {
    if (selectedParkId && parks.length > 0) {
      const park = parks.find(p => p.id === selectedParkId);
      setCurrentPark(park || null);
    }
  }, [selectedParkId, parks]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      // Auto-close sidebar on mobile if it was open
      if (window.innerWidth <= 768 && sidebarOpen) {
        const stored = localStorage.getItem('sidebarOpen');
        if (stored === null) {
          setSidebarOpen(false);
        }
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [sidebarOpen]);

  // Close sidebar on mobile when route changes
  useEffect(() => {
    if (window.innerWidth <= 768) {
      setSidebarOpen(false);
    }
  }, [location.pathname]);

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

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
        <div className="sidebar-header">
          <Link to="/" className="sidebar-logo">
            {currentPark?.logoUrl ? (
              <img src={currentPark.logoUrl} alt={currentPark.name} className="logo-image" />
            ) : (
              <span className="logo-icon">OM</span>
            )}
            <span className="logo-text">{currentPark?.name || 'Open Meeting'}</span>
          </Link>
          <button className="sidebar-toggle" onClick={toggleSidebar} aria-label="Toggle sidebar">
            <span className="toggle-icon">{sidebarOpen ? '\u2039' : '\u203A'}</span>
          </button>
        </div>

        <nav className="sidebar-nav">
          {isSuperAdmin && parks.length > 0 && (
            <div className="sidebar-section">
              <span className="sidebar-section-label">Park</span>
              <select
                className="park-select"
                value={selectedParkId}
                onChange={(e) => handleParkChange(e.target.value)}
                title="Select Park"
              >
                {parks.map(park => (
                  <option key={park.id} value={park.id}>
                    {park.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="sidebar-section">
            <span className="sidebar-section-label">Navigation</span>
            <ul className="sidebar-menu">
              <li>
                <Link to="/" className={`sidebar-link ${isActive('/') ? 'active' : ''}`}>
                  <span className="link-icon">&#128197;</span>
                  <span className="link-text">Calendar</span>
                </Link>
              </li>
              <li>
                <Link to="/rooms" className={`sidebar-link ${isActive('/rooms') ? 'active' : ''}`}>
                  <span className="link-icon">&#127970;</span>
                  <span className="link-text">Rooms</span>
                </Link>
              </li>
              <li>
                <Link to="/my-bookings" className={`sidebar-link ${isActive('/my-bookings') ? 'active' : ''}`}>
                  <span className="link-icon">&#128203;</span>
                  <span className="link-text">My Bookings</span>
                </Link>
              </li>
              <li>
                <Link to="/account/security" className={`sidebar-link ${isActive('/account/security') ? 'active' : ''}`}>
                  <span className="link-icon">&#128274;</span>
                  <span className="link-text">Security</span>
                </Link>
              </li>
            </ul>
          </div>

          {isCompanyAdmin && (
            <div className="sidebar-section">
              <span className="sidebar-section-label">Management</span>
              <ul className="sidebar-menu">
                <li>
                  <Link to="/users" className={`sidebar-link ${isActive('/users') ? 'active' : ''}`}>
                    <span className="link-icon">&#128101;</span>
                    <span className="link-text">Users</span>
                  </Link>
                </li>
                {user?.companyId && !isAdmin && (
                  <>
                    <li>
                      <Link to={`/admin/ldap/${user.companyId}`} className={`sidebar-link ${location.pathname.startsWith('/admin/ldap') ? 'active' : ''}`}>
                        <span className="link-icon">&#128272;</span>
                        <span className="link-text">LDAP Settings</span>
                      </Link>
                    </li>
                    <li>
                      <Link to={`/admin/sso/${user.companyId}`} className={`sidebar-link ${location.pathname.startsWith('/admin/sso') ? 'active' : ''}`}>
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
                  <Link to="/reception" className={`sidebar-link ${isActive('/reception') ? 'active' : ''}`}>
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
                  <Link to="/admin/rooms" className={`sidebar-link ${isActive('/admin/rooms') ? 'active' : ''}`}>
                    <span className="link-icon">&#128736;</span>
                    <span className="link-text">Manage Rooms</span>
                  </Link>
                </li>
                <li>
                  <Link to="/admin/devices" className={`sidebar-link ${isActive('/admin/devices') ? 'active' : ''}`}>
                    <span className="link-icon">&#128187;</span>
                    <span className="link-text">Devices</span>
                  </Link>
                </li>
                <li>
                  <Link to="/admin/companies" className={`sidebar-link ${isActive('/admin/companies') ? 'active' : ''}`}>
                    <span className="link-icon">&#127970;</span>
                    <span className="link-text">Companies</span>
                  </Link>
                </li>
                <li>
                  <Link to="/admin/statistics" className={`sidebar-link ${isActive('/admin/statistics') ? 'active' : ''}`}>
                    <span className="link-icon">&#128202;</span>
                    <span className="link-text">Statistics</span>
                  </Link>
                </li>
                <li>
                  <Link to="/admin/settings" className={`sidebar-link ${isActive('/admin/settings') ? 'active' : ''}`}>
                    <span className="link-icon">&#9881;</span>
                    <span className="link-text">Settings</span>
                  </Link>
                </li>
                {isSuperAdmin && (
                  <li>
                    <Link to="/admin/parks" className={`sidebar-link ${isActive('/admin/parks') ? 'active' : ''}`}>
                      <span className="link-icon">&#127795;</span>
                      <span className="link-text">Parks</span>
                    </Link>
                  </li>
                )}
              </ul>
            </div>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <div className="user-details">
              <span className="user-name">{user?.name}</span>
              <span className="user-role">{user?.role.replace(/_/g, ' ')}</span>
            </div>
          </div>
          <button onClick={handleLogout} className="logout-btn" title="Logout">
            <span className="link-icon">&#10145;</span>
            <span className="link-text">Logout</span>
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
  );
}
