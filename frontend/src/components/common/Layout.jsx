import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: '▦', roles: ['admin','hr','manager','employee'] },
  { to: '/attendance/live', label: 'Live Check-in', icon: '◉', roles: ['admin','hr','manager'] },
  { to: '/attendance/logs', label: 'Attendance Logs', icon: '☰', roles: ['admin','hr','manager'] },
  { to: '/reports', label: 'Reports', icon: '📊', roles: ['admin','hr','manager'] },
  { to: '/manual-attendance', label: 'Manual Attendance', icon: '✏️', roles: ['admin','hr','manager'] },
  { to: '/my-attendance', label: 'My Attendance', icon: '📅', roles: ['admin','hr','manager','employee'] },
  { to: '/employees', label: 'Employees', icon: '◈', roles: ['admin','hr'] },
  { to: '/leave', label: 'Leave', icon: '◷', roles: ['admin','hr','manager','employee'] },
  { to: '/overtime', label: 'Overtime', icon: '⏱', roles: ['admin','hr','manager','employee'] },
  { to: '/payroll/salary-structures', label: 'Salary Structures', icon: '🔥', roles: ['admin','hr'] },
  { to: '/payroll/payslips', label: 'Payslips', icon: '🗒', roles: ['admin','hr','employee'] },
  { to: '/payroll/notifications', label: 'Notifications', icon: '🔔', roles: ['admin','hr'] },
  { to: '/settings', label: 'Settings', icon: '⚙', roles: ['admin'] },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const visible = navItems.filter(n => n.roles.includes(user?.role))

  return (
    <div className="flex h-screen bg-gray-50">
      <aside className="w-56 bg-white border-r border-gray-100 flex flex-col">
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white text-sm font-bold">A</div>
            <span className="font-semibold text-gray-900 text-sm">AttendPro</span>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {visible.map(item => (
            <NavLink key={item.to} to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`
              }>
              <span className="text-base">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-gray-100">
          <div className="px-3 py-2 mb-1">
            <p className="text-xs font-medium text-gray-900 truncate">{user?.full_name || user?.email}</p>
            <p className="text-xs text-gray-400 capitalize">{user?.role}</p>
          </div>
          <button onClick={logout}
            className="w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-red-50 rounded-lg transition-colors">
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
