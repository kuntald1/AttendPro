import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { reportsAPI, departmentAPI, shiftAPI, settingsAPI, employeeAPI } from '../api'
import toast from 'react-hot-toast'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

export default function Reports() {
  const [activeTab, setActiveTab] = useState('monthly')
  const currentYear = new Date().getFullYear()
  const currentMonth = new Date().getMonth() + 1
  const [year, setYear] = useState(currentYear)
  const [month, setMonth] = useState(currentMonth)
  const [exporting, setExporting] = useState(false)
  const [filters, setFilters] = useState({ employee_id: '', department_id: '', shift_id: '', office_id: '' })

  const { data: departments = [] } = useQuery({ queryKey: ['departments'], queryFn: () => departmentAPI.list().then(r => r.data) })
  const { data: shifts = [] } = useQuery({ queryKey: ['shifts'], queryFn: () => shiftAPI.list().then(r => r.data) })
  const { data: offices = [] } = useQuery({ queryKey: ['offices'], queryFn: () => settingsAPI.getOffices().then(r => r.data) })
  const { data: employees = [] } = useQuery({ queryKey: ['employees'], queryFn: () => employeeAPI.list().then(r => r.data) })

  const params = {
    year, month,
    ...(filters.employee_id && { employee_id: filters.employee_id }),
    ...(filters.department_id && { department_id: filters.department_id }),
    ...(filters.shift_id && { shift_id: filters.shift_id }),
    ...(filters.office_id && { office_id: filters.office_id }),
  }

  const { data: summary, isLoading } = useQuery({
    queryKey: ['monthly-summary', params],
    queryFn: () => reportsAPI.monthlySummary(params).then(r => r.data),
    enabled: activeTab === 'monthly'
  })

  const { data: lateReport } = useQuery({
    queryKey: ['late-report', params],
    queryFn: () => reportsAPI.lateReport(params).then(r => r.data),
    enabled: activeTab === 'late'
  })

  const { data: absentReport } = useQuery({
    queryKey: ['absent-report', params],
    queryFn: () => reportsAPI.absentReport(
      `${year}-${String(month).padStart(2,'0')}-01`,
      `${year}-${String(month).padStart(2,'0')}-${new Date(year, month, 0).getDate()}`,
      filters
    ).then(r => r.data),
    enabled: activeTab === 'absent'
  })

  const exportExcel = async () => {
    setExporting(true)
    try {
      const res = await reportsAPI.exportExcel(year, month)
      const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `attendance_${year}_${String(month).padStart(2,'0')}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Excel exported!')
    } catch { toast.error('Export failed') }
    finally { setExporting(false) }
  }

  const statusColor = (pct) => {
    if (pct >= 90) return 'text-green-600 bg-green-50'
    if (pct >= 75) return 'text-yellow-600 bg-yellow-50'
    return 'text-red-600 bg-red-50'
  }

  const FilterBar = () => (
    <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4">
      <p className="text-xs text-gray-500 mb-3 font-medium uppercase tracking-wide">Filter</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <select value={filters.employee_id} onChange={e => setFilters(p => ({ ...p, employee_id: e.target.value }))}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">All Employees</option>
          {employees.filter(e => e.is_active).map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
        </select>
        <select value={filters.department_id} onChange={e => setFilters(p => ({ ...p, department_id: e.target.value }))}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">All Departments</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select value={filters.shift_id} onChange={e => setFilters(p => ({ ...p, shift_id: e.target.value }))}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">All Shifts</option>
          {shifts.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={filters.office_id} onChange={e => setFilters(p => ({ ...p, office_id: e.target.value }))}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">All Offices</option>
          {offices.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </div>
    </div>
  )

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Reports</h1>
          <p className="text-sm text-gray-500">Attendance analytics and exports</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <select value={month} onChange={e => setMonth(parseInt(e.target.value))}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            {MONTHS.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
          </select>
          <select value={year} onChange={e => setYear(parseInt(e.target.value))}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            {[currentYear-1, currentYear, currentYear+1].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={exportExcel} disabled={exporting}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors">
            {exporting ? '⏳ Exporting...' : '📥 Export Excel'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-100">
        {[
          { id: 'monthly', label: '📊 Monthly Summary' },
          { id: 'late', label: '⏰ Late Report' },
          { id: 'absent', label: '❌ Absent Report' },
        ].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <FilterBar />

      {/* Monthly Summary */}
      {activeTab === 'monthly' && (
        <div>
          {summary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              {[
                { label: 'Working Days', value: summary.working_days, color: 'blue' },
                { label: 'Total Employees', value: summary.summary?.length || 0, color: 'purple' },
                { label: 'Holidays', value: summary.holidays?.length || 0, color: 'orange' },
                { label: 'Avg Attendance', value: `${summary.summary?.length ? Math.round(summary.summary.reduce((a,b) => a + b.attendance_pct, 0) / summary.summary.length) : 0}%`, color: 'green' },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-xl border border-gray-100 p-4">
                  <p className="text-xs text-gray-500 mb-1">{s.label}</p>
                  <p className={`text-2xl font-bold text-${s.color}-600`}>{s.value}</p>
                </div>
              ))}
            </div>
          )}

          {summary?.holidays?.length > 0 && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 mb-4">
              <p className="text-xs font-medium text-amber-700 mb-2">🎉 Holidays this month</p>
              <div className="flex gap-2 flex-wrap">
                {summary.holidays.map(h => (
                  <span key={h.date} className="text-xs bg-white border border-amber-200 text-amber-700 px-2 py-1 rounded-full">
                    {h.name} · {new Date(h.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
            {isLoading ? (
              <div className="p-8 text-center text-gray-400 text-sm">Loading...</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {['Employee', 'Department', 'Shift', 'Present', 'Late', 'Absent', 'On Leave', 'Early Leave', 'Hours', 'Attendance %'].map(h => (
                      <th key={h} className="text-left text-xs font-medium text-gray-500 px-4 py-3 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {summary?.summary?.map(emp => (
                    <tr key={emp.employee_id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{emp.full_name}</p>
                        <p className="text-xs text-gray-400">{emp.employee_code}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{emp.department}</td>
                      <td className="px-4 py-3 text-gray-600">{emp.shift}</td>
                      <td className="px-4 py-3 text-green-600 font-medium">{emp.present}</td>
                      <td className="px-4 py-3 text-yellow-600 font-medium">{emp.late}</td>
                      <td className="px-4 py-3 text-red-600 font-medium">{emp.absent}</td>
                      <td className="px-4 py-3 text-blue-600 font-medium">{emp.on_leave}</td>
                      <td className="px-4 py-3">
                        {emp.early_leaves > 0 ? (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-orange-50 text-orange-600">{emp.early_leaves}x</span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{emp.total_hours}h</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusColor(emp.attendance_pct)}`}>
                          {emp.attendance_pct}%
                        </span>
                      </td>
                    </tr>
                  ))}
                  {!summary?.summary?.length && (
                    <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-400">No data for this period</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Late Report */}
      {activeTab === 'late' && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-medium text-gray-900">Late Coming Report — {MONTHS[month-1]} {year}</p>
            <p className="text-xs text-gray-500">{lateReport?.length || 0} late entries</p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Date', 'Employee', 'Department', 'Check-in Time'].map(h => (
                  <th key={h} className="text-left text-xs font-medium text-gray-500 px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {lateReport?.map((r, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600">{new Date(r.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', weekday: 'short' })}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{r.full_name}</p>
                    <p className="text-xs text-gray-400">{r.employee_code}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{r.department}</td>
                  <td className="px-4 py-3">
                    <span className="text-yellow-600 font-medium bg-yellow-50 px-2 py-0.5 rounded-full text-xs">{r.check_in_time}</span>
                  </td>
                </tr>
              ))}
              {!lateReport?.length && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">No late entries this month 🎉</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Absent Report */}
      {activeTab === 'absent' && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-medium text-gray-900">Absent Report — {MONTHS[month-1]} {year}</p>
            <p className="text-xs text-gray-500">{absentReport?.length || 0} absent entries</p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Date', 'Employee', 'Department'].map(h => (
                  <th key={h} className="text-left text-xs font-medium text-gray-500 px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {absentReport?.map((r, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600">{new Date(r.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', weekday: 'short' })}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{r.full_name}</p>
                    <p className="text-xs text-gray-400">{r.employee_code}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{r.department}</td>
                </tr>
              ))}
              {!absentReport?.length && (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-400">No absent records found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
