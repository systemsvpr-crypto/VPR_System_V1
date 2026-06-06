import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Layout from './components/Layout';
import Login from './pages/Login';
import MyProfile from './pages/MyProfile/MyProfile';
import ProtectedRoute from './components/ProtectedRoute';
import Settings from './pages/Settings/Settings';
import Master from './pages/Master/Master';
import StockManagement from './pages/StockManagement/StockManagement';
import LiveStockDashboard from './pages/LiveStockDashboard/LiveStockDashboard';
import StockList from './pages/StockList/StockList';
import { PAGES } from './constants';

function App() {
  return (
    <div className="gradient-bg min-h-screen">
      <Router>
        <Toaster position="top-right" containerStyle={{ zIndex: 99999 }} />
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route path="/stock-list" element={
            <ProtectedRoute>
              <StockList />
            </ProtectedRoute>
          } />

          <Route path="/" element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }>
            <Route index element={<Navigate to={`/${PAGES.find(p => p.id === 'live-stock-dashboard').id}`} replace />} />
            <Route path="live-stock-dashboard" element={<LiveStockDashboard />} />
            <Route path="stock-management" element={<StockManagement />} />
            <Route path="master" element={<Master />} />
            <Route path="settings" element={<Settings />} />
            <Route path="my-profile" element={<MyProfile />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </div >
  );
}

export default App;