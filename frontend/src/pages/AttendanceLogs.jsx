import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { attendanceAPI, employeeAPI, reportsAPI } from '../api'

export default function AttendanceLogs() {
  const today = new Date().toISOString().split('T')[0]
  const [fromDate, setFromDate] = useState(today)
  const [toDate, setToDate] = useState(today)
  const [empId, setEmpId] = useState('')
  const [viewMode, setViewMode] = useState('daily') // daily or scanlogs

  const { data: employees = [] } = useQuery({ queryKey: ['employees'], queryFn: () => employeeAPI.list().then(r => r.data) })

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['attendance-logs', fromDate, toDate, empId],
    queryFn: () => attendanceAPI.logs({ from_date: fromDate, to_date: toDate, employee_id: empId || undefined }).then(r => r.data),
    enabled: viewMode === 'daily'
  })

  const { data: scanLogs = [], isLoading: scanLoading } = useQuery({
    queryKey: ['scan-logs', fromDate, empId],
    queryFn: () => reportsAPI.scanLogs(fromDate, empId || undefined).then(r => r.data),
    enabled: viewMode === 'scanlogs'
  })

  const toIST = (str) => {
    if (!str) return '—'
    // If it's just a time string like "03:31:12", add today's date
    let dateStr = str
    if (/^\d{2}:\d{2}:\d{2}/.test(str) && !str.includes('T') && !str.includes('-')) {
      dateStr = new Date().toISOString().split('T')[0] + 'T' + str + 'Z'
    } else {
      dateStr = str.endsWith('Z') ? str : str + 'Z'
    }
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return str  // fallback to raw string
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })
  }

  const parseTime = (str) => {
    if (!str) return null
    return new Date(str.endsWith('Z') ? str : str + 'Z')
  }

  const getDuration = (log) => {
    if (!log.check_in_time || !log.check_out_time) return '—'
    const cin  = parseTime(log.check_in_time)
    const cout = parseTime(log.check_out_time)
    if (!cin || !cout) return '—'
    const mins = Math.floor((cout - cin) / 60000)
    if (mins < 0) return '—'
    return `${Math.floor(mins/60)}h ${mins%60}m`
  }

  const statusColors = {
    present: 'bg-green-50 text-green-700',
    late: 'bg-yellow-50 text-yellow-700',
    absent: 'bg-red-50 text-red-700',
    on_leave: 'bg-blue-50 text-blue-700',
    half_day: 'bg-purple-50 text-purple-700',
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Attendance Logs</h1>
          <p className="text-sm text-gray-500">{viewMode === 'daily' ? logs.length : scanLogs.length} records</p>
        </div>
        {/* View mode toggle */}
        <div className="flex bg-gray-100 rounded-lg p-1">
          <button onClick={() => setViewMode('daily')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'daily' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
            Daily Summary
          </button>
          <button onClick={() => setViewMode('scanlogs')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'scanlogs' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
            All Scans
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4">
        <div className="flex gap-3 flex-wrap">
          <div>
            <label className="block text-xs text-gray-500 mb-1">From date</label>
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          {viewMode === 'daily' && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">To date</label>
              <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          )}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Employee</label>
            <select value={empId} onChange={e => setEmpId(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">All employees</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Daily Summary View */}
      {viewMode === 'daily' && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['Date', 'Employee', 'Department', 'Shift', 'Check In', 'Check Out', 'Duration', 'Status', 'Early Leave', 'Method'].map(h => (
                  <th key={h} className="text-left text-xs font-medium text-gray-500 px-4 py-3 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>
              ) : logs.map(log => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{log.date}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-medium flex-shrink-0">
                        {log.employee?.full_name?.charAt(0)}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{log.employee?.full_name}</p>
                        <p className="text-xs text-gray-400">{log.employee?.employee_code}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{log.employee?.department?.name || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{log.employee?.shift?.name || '—'}</td>
                  <td className="px-4 py-3 text-gray-700 font-mono text-xs whitespace-nowrap">
                    {log.check_in_time ? toIST(log.check_in_time) : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-700 font-mono text-xs whitespace-nowrap">
                    {log.check_out_time ? toIST(log.check_out_time) : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{getDuration(log)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[log.status] || 'bg-gray-50 text-gray-500'}`}>
                      {log.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {log.early_leave ? (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-orange-50 text-orange-600">⚠ Early</span>
                    ) : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-500 capitalize text-xs">{log.method}</td>
                </tr>
              ))}
              {!isLoading && !logs.length && (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-400">No records found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* All Scans View */}
      {viewMode === 'scanlogs' && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-blue-50">
            <p className="text-sm font-medium text-blue-800">All Face Scans — {fromDate}</p>
            <p className="text-xs text-blue-600">Every scan recorded — first scan = Check In, last scan = Check Out</p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['#', 'Time', 'Employee', 'Confidence', 'Date'].map(h => (
                  <th key={h} className="text-left text-xs font-medium text-gray-500 px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {scanLoading ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>
              ) : scanLogs.map((log, i) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-400 text-xs">{i + 1}</td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-sm font-medium text-gray-900 bg-gray-100 px-2 py-1 rounded">{toIST(log.scan_time)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{log.employee_name}</p>
                    <p className="text-xs text-gray-400">{log.employee_code}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${log.confidence >= 90 ? 'bg-green-50 text-green-700' : log.confidence >= 75 ? 'bg-yellow-50 text-yellow-700' : 'bg-red-50 text-red-700'}`}>
                      {log.confidence}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{log.date}</td>
                </tr>
              ))}
              {!scanLoading && !scanLogs.length && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No scans found for this date</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
