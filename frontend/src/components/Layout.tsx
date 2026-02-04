import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { Park } from '../types';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { user, logout, isAdmin, isCompanyAdmin, isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [parks, setParks] = useState<Park[]>([]);
  const [selectedParkId, setSelectedParkId] = useState<string>('');
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (isSuperAdmin) {
      loadParks();
    }
  }, [isSuperAdmin]);

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

  // Close menu when route changes
  useEffect(() => {
    setMenuOpen(false);
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
    // Reload the page to refresh data with new park context
    window.location.reload();
  };

  const handleLogout = () => {
    localStorage.removeItem('selectedParkId');
    logout();
    navigate('/login');
  };

  const isActive = (path: string) => location.pathname === path;

  const toggleMenu = () => setMenuOpen(!menuOpen);

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="nav-container">
        <div className="nav-content">
          <div className="nav-brand">
            <Link to="/" className="nav-logo">
              Open Meeting
            </Link>
          </div>

          <button className="burger-btn" onClick={toggleMenu} aria-label="Toggle menu">
            <span className={`burger-line ${menuOpen ? 'open' : ''}`}></span>
            <span className={`burger-line ${menuOpen ? 'open' : ''}`}></span>
            <span className={`burger-line ${menuOpen ? 'open' : ''}`}></span>
          </button>

          <div className={`nav-menu ${menuOpen ? 'open' : ''}`}>
            {isSuperAdmin && parks.length > 0 && (
              <div className="nav-section">
                <span className="nav-section-label">Current Park</span>
                <select
                  className="park-switcher"
                  value={selectedParkId}
                  onChange={(e) => handleParkChange(e.target.value)}
                >
                  {parks.map(park => (
                    <option key={park.id} value={park.id}>
                      {park.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="nav-section">
              <span className="nav-section-label">Navigation</span>
              <div className="nav-links">
                <Link
                  to="/"
                  className={`nav-link ${isActive('/') ? 'active' : ''}`}
                >
                  Calendar
                </Link>
                <Link
                  to="/rooms"
                  className={`nav-link ${isActive('/rooms') ? 'active' : ''}`}
                >
                  Rooms
                </Link>
                <Link
                  to="/my-bookings"
                  className={`nav-link ${isActive('/my-bookings') ? 'active' : ''}`}
                >
                  My Bookings
                </Link>
              </div>
            </div>

            {isCompanyAdmin && (
              <div className="nav-section">
                <span className="nav-section-label">Management</span>
                <div className="nav-links">
                  <Link
                    to="/users"
                    className={`nav-link ${isActive('/users') ? 'active' : ''}`}
                  >
                    Users
                  </Link>
                </div>
              </div>
            )}

            {isAdmin && (
              <div className="nav-section">
                <span className="nav-section-label">Administration</span>
                <div className="nav-links">
                  <Link
                    to="/admin/rooms"
                    className={`nav-link ${isActive('/admin/rooms') ? 'active' : ''}`}
                  >
                    Manage Rooms
                  </Link>
                  <Link
                    to="/admin/devices"
                    className={`nav-link ${isActive('/admin/devices') ? 'active' : ''}`}
                  >
                    Devices
                  </Link>
                  <Link
                    to="/admin/companies"
                    className={`nav-link ${isActive('/admin/companies') ? 'active' : ''}`}
                  >
                    Companies
                  </Link>
                  <Link
                    to="/admin/settings"
                    className={`nav-link ${isActive('/admin/settings') ? 'active' : ''}`}
                  >
                    Settings
                  </Link>
                  {isSuperAdmin && (
                    <Link
                      to="/admin/parks"
                      className={`nav-link ${isActive('/admin/parks') ? 'active' : ''}`}
                    >
                      Parks
                    </Link>
                  )}
                </div>
              </div>
            )}

            <div className="nav-section nav-user-section">
              <div className="nav-user-info">
                <span className="user-name">{user?.name}</span>
                <span className="user-role">{user?.role.replace(/_/g, ' ')}</span>
              </div>
              <button onClick={handleLogout} className="btn btn-secondary btn-logout">
                Logout
              </button>
            </div>
          </div>

          {/* Overlay for mobile */}
          {menuOpen && <div className="nav-overlay" onClick={() => setMenuOpen(false)}></div>}
        </div>
      </nav>

      <main className="main-content">
        {children}
      </main>
    </div>
  );
}
