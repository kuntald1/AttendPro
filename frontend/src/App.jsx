import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/common/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import LiveCheckinHub from './pages/LiveCheckinHub'
import LiveCheckinLaptop from './pages/LiveCheckinLaptop'
import LiveCheckinUSB from './pages/LiveCheckinUSB'
import LiveCheckinIP from './pages/LiveCheckinIP'
import LiveCheckinPi from './pages/LiveCheckinPi'
import Kiosk from './pages/Kiosk'
import PersonalKiosk from './pages/PersonalKiosk'
import AttendanceLogs from './pages/AttendanceLogs'
import Employees from './pages/Employees'
import Leave from './pages/Leave'
import Settings from './pages/Settings'
import Reports from './pages/Reports'
import MyAttendance from './pages/MyAttendance'
import ManualAttendance from './pages/ManualAttendance'
import SalaryStructurePage from './pages/payroll/SalaryStructurePage'
import PayslipsPage from './pages/payroll/PayslipsPage'
import NotificationsPage from './pages/payroll/NotificationsPage'


const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30000 } } })

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">Loading...</div>
  if (!user) return <Navigate to="/login" replace />
  return children
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      {/* Public kiosk routes - no login required for device kiosk */}
      <Route path="/kiosk" element={<Kiosk />} />
      {/* Personal kiosk - employee logs in with their own credentials */}
      <Route path="/my-kiosk" element={<PersonalKiosk />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="attendance/live" element={<LiveCheckinHub />} />
        <Route path="attendance/live/laptop" element={<LiveCheckinLaptop />} />
        <Route path="attendance/live/usb" element={<LiveCheckinUSB />} />
        <Route path="attendance/live/ip" element={<LiveCheckinIP />} />
        <Route path="attendance/live/pi" element={<LiveCheckinPi />} />
        <Route path="attendance/logs" element={<AttendanceLogs />} />
        <Route path="employees" element={<Employees />} />
        <Route path="leave" element={<Leave />} />
        <Route path="settings" element={<Settings />} />
        <Route path="departments" element={<Settings />} />
        <Route path="reports" element={<Reports />} />
        <Route path="my-attendance" element={<MyAttendance />} />
        <Route path="manual-attendance" element={<ManualAttendance />} />
        <Route path="payroll/salary-structures" element={<SalaryStructurePage />} />
        <Route path="payroll/payslips" element={<PayslipsPage />} />
        <Route path="payroll/notifications" element={<NotificationsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
          <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
