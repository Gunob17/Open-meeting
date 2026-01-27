import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { user, logout, isAdmin, isCompanyAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="nav-container">
        <div className="nav-content">
          <div className="nav-brand">
            <Link to="/" className="nav-logo">
              Meeting Room Booking
            </Link>
          </div>

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

            {isCompanyAdmin && (
              <Link
                to="/users"
                className={`nav-link ${isActive('/users') ? 'active' : ''}`}
              >
                Users
              </Link>
            )}

            {isAdmin && (
              <>
                <Link
                  to="/admin/rooms"
                  className={`nav-link ${isActive('/admin/rooms') ? 'active' : ''}`}
                >
                  Manage Rooms
                </Link>
                <Link
                  to="/admin/companies"
                  className={`nav-link ${isActive('/admin/companies') ? 'active' : ''}`}
                >
                  Companies
                </Link>
              </>
            )}
          </div>

          <div className="nav-user">
            <span className="user-info">
              {user?.name} ({user?.role.replace('_', ' ')})
            </span>
            <button onClick={handleLogout} className="btn btn-secondary">
              Logout
            </button>
          </div>
        </div>
      </nav>

      <main className="main-content">
        {children}
      </main>
    </div>
  );
}
