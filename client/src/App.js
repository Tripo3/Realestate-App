import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Sidebar from './components/Sidebar';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Properties from './pages/Properties';
import PropertyDetail from './pages/PropertyDetail';
import Transactions from './pages/Transactions';
import Reports from './pages/Reports';
import BankConnections from './pages/BankConnections';
import Documents from './pages/Documents';
import Leases from './pages/Leases';
import Settings from './pages/Settings';

const AuthenticatedLayout = ({ children }) => {
  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        {children}
      </main>
    </div>
  );
};

const ProtectedPage = ({ children }) => (
  <ProtectedRoute>
    <AuthenticatedLayout>{children}</AuthenticatedLayout>
  </ProtectedRoute>
);

const App = () => {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/" element={<ProtectedPage><Dashboard /></ProtectedPage>} />
        <Route path="/properties" element={<ProtectedPage><Properties /></ProtectedPage>} />
        <Route path="/properties/:id" element={<ProtectedPage><PropertyDetail /></ProtectedPage>} />
        <Route path="/transactions" element={<ProtectedPage><Transactions /></ProtectedPage>} />
        <Route path="/reports" element={<ProtectedPage><Reports /></ProtectedPage>} />
        <Route path="/bank-connections" element={<ProtectedPage><BankConnections /></ProtectedPage>} />
        <Route path="/documents" element={<ProtectedPage><Documents /></ProtectedPage>} />
        <Route path="/leases" element={<ProtectedPage><Leases /></ProtectedPage>} />
        <Route path="/settings" element={<ProtectedPage><Settings /></ProtectedPage>} />
      </Routes>
    </AuthProvider>
  );
};

export default App;
