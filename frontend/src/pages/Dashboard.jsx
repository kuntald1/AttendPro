import { useQuery } from '@tanstack/react-query'
import { attendanceAPI } from '../api'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis } from 'recharts'

const StatCard = ({ label, value, color }) => (
  <div className="bg-white rounded-xl border border-gray-100 p-5">
    <p className="text-sm text-gray-500 mb-1">{label}</p>
    <p className={`text-3xl font-semibold ${color}`}>{value}</p>
  </div>
)

export default function Dashboard() {
  const { data: stats } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => attendanceAPI.dashboard().then(r => r.data),
    refetchInterval: 30000,
  })

  const { data: todayLogs } = useQuery({
    queryKey: ['today'],
    queryFn: () => attendanceAPI.today().then(r => r.data),
    refetchInterval: 30000,
  })

  const pieData = stats ? [
    { name: 'Present', value: stats.present_today, color: '#22c55e' },
    { name: 'Late', value: stats.late_today, color: '#f59e0b' },
    { name: 'On Leave', value: stats.on_leave_today, color: '#3b82f6' },
    { name: 'Absent', value: stats.absent_today, color: '#ef4444' },
  ].filter(d => d.value > 0) : []

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500">{new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <StatCard label="Total Employees" value={stats?.total_employees ?? '—'} color="text-gray-900" />
        <StatCard label="Present" value={stats?.present_today ?? '—'} color="text-green-600" />
        <StatCard label="Late" value={stats?.late_today ?? '—'} color="text-amber-600" />
        <StatCard label="On Leave" value={stats?.on_leave_today ?? '—'} color="text-blue-600" />
        <StatCard label="Absent" value={stats?.absent_today ?? '—'} color="text-red-500" />
      </div>

      {/* Attendance % banner */}
      <div className="bg-blue-600 text-white rounded-xl p-5 mb-6 flex items-center justify-between">
        <div>
          <p className="text-blue-100 text-sm">Today's attendance rate</p>
          <p className="text-4xl font-bold">{stats?.attendance_percentage ?? 0}%</p>
        </div>
        <div className="w-20 h-20 rounded-full border-4 border-blue-400 flex items-center justify-center">
          <span className="text-lg font-bold">{stats?.attendance_percentage ?? 0}%</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie chart */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h2 className="text-sm font-medium text-gray-700 mb-4">Today's breakdown</h2>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} dataKey="value">
                  {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-gray-400 text-sm">No data yet</div>
          )}
          <div className="flex flex-wrap gap-3 mt-2">
            {pieData.map(d => (
              <div key={d.name} className="flex items-center gap-1.5 text-xs text-gray-600">
                <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: d.color }} />
                {d.name}: {d.value}
              </div>
            ))}
          </div>
        </div>

        {/* Recent check-ins */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h2 className="text-sm font-medium text-gray-700 mb-4">Recent check-ins</h2>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {todayLogs?.slice(0, 10).map(log => (
              <div key={log.id} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-50">
                <div>
                  <p className="font-medium text-gray-800">{log.employee?.full_name}</p>
                  <p className="text-xs text-gray-400">{log.employee?.employee_code}</p>
                </div>
                <div className="text-right">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    log.status === 'present' ? 'bg-green-50 text-green-700' :
                    log.status === 'late' ? 'bg-amber-50 text-amber-700' :
                    'bg-gray-50 text-gray-600'
                  }`}>
                    {log.status}
                  </span>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {log.check_in_time ? new Date(log.check_in_time).toLocaleTimeString() : '—'}
                  </p>
                </div>
              </div>
            ))}
            {(!todayLogs || todayLogs.length === 0) && (
              <p className="text-sm text-gray-400 text-center py-8">No check-ins yet today</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
