import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth.jsx'
import LoginPage from './pages/LoginPage.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import AggregatorPage from './pages/AggregatorPage.jsx'
import PricePage from './pages/PricePage.jsx'
import ShopifyPage from './pages/ShopifyPage.jsx'

function PrivateRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh' }}>
      <span className="spinner spinner-orange" style={{ width: 32, height: 32, borderWidth: 3 }} />
    </div>
  )
  return user ? children : <Navigate to="/login" replace />
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<PrivateRoute><DashboardPage /></PrivateRoute>} />
      <Route path="/aggregator" element={<PrivateRoute><AggregatorPage /></PrivateRoute>} />
      <Route path="/price" element={<PrivateRoute><PricePage /></PrivateRoute>} />
      <Route path="/shopify" element={<PrivateRoute><ShopifyPage /></PrivateRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}
