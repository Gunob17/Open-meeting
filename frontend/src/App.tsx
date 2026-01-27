import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { CalendarPage } from './pages/CalendarPage';
import { RoomsListPage } from './pages/RoomsListPage';
import { MyBookingsPage } from './pages/MyBookingsPage';
import { UsersPage } from './pages/UsersPage';
import { AdminRoomsPage } from './pages/AdminRoomsPage';
import { CompaniesPage } from './pages/CompaniesPage';
import './styles.css';

function PrivateRoute({ children, adminOnly = false, companyAdminOnly = false }: {
  children: React.ReactNode;
  adminOnly?: boolean;
  companyAdminOnly?: boolean;
}) {
  const { user, loading, isAdmin, isCompanyAdmin } = useAuth();

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  if (adminOnly && !isAdmin) {
    return <Navigate to="/" />;
  }

  if (companyAdminOnly && !isCompanyAdmin) {
    return <Navigate to="/" />;
  }

  return <Layout>{children}</Layout>;
}

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to="/" /> : <LoginPage />}
      />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <CalendarPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/rooms"
        element={
          <PrivateRoute>
            <RoomsListPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/my-bookings"
        element={
          <PrivateRoute>
            <MyBookingsPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/users"
        element={
          <PrivateRoute companyAdminOnly>
            <UsersPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/rooms"
        element={
          <PrivateRoute adminOnly>
            <AdminRoomsPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/companies"
        element={
          <PrivateRoute adminOnly>
            <CompaniesPage />
          </PrivateRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
