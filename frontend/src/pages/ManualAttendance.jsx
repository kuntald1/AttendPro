import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { manualAttendanceAPI, employeeAPI } from '../api'
import toast from 'react-hot-toast'

const STATUS_OPTIONS = [
  { value: 'present', label: 'Present', color: 'text-green-600' },
  { value: 'late', label: 'Late', color: 'text-yellow-600' },
  { value: 'absent', label: 'Absent', color: 'text-red-600' },
  { value: 'on_leave', label: 'On Leave', color: 'text-blue-600' },
  { value: 'half_day', label: 'Half Day', color: 'text-purple-600' },
]

export default function ManualAttendance() {
  const today = new Date().toISOString().split('T')[0]
  const [date, setDate] = useState(today)
  const [empId, setEmpId] = useState('')
  const [saving, setSaving] = useState({})
  const [edits, setEdits] = useState({})
  const qc = useQueryClient()

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => employeeAPI.list().then(r => r.data)
  })

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['manual-attendance', date, empId],
    queryFn: () => manualAttendanceAPI.list(date, empId || undefined).then(r => r.data),
  })

  const getEdit = (empId, field) => {
    const key = `${empId}`
    if (edits[key]?.[field] !== undefined) return edits[key][field]
    const emp = data?.employees?.find(e => e.employee_id === empId)
    if (!emp) return ''
    return emp[field] || ''
  }

  const setEdit = (empId, field, value) => {
    setEdits(prev => ({
      ...prev,
      [empId]: { ...(prev[empId] || {}), [field]: value }
    }))
  }

  const hasChanged = (emp) => {
    const key = `${emp.employee_id}`
    return edits[key] !== undefined
  }

  const save = async (emp) => {
    const key = `${emp.employee_id}`
    setSaving(p => ({ ...p, [key]: true }))
    try {
      await manualAttendanceAPI.save({
        employee_id: emp.employee_id,
        date,
        check_in_time: getEdit(emp.employee_id, 'check_in_time'),
        check_out_time: getEdit(emp.employee_id, 'check_out_time'),
        status: getEdit(emp.employee_id, 'status') || emp.status,
        remarks: getEdit(emp.employee_id, 'remarks') || emp.remarks || '',
      })
      setEdits(p => { const n = { ...p }; delete n[key]; return n })
      refetch()
      qc.invalidateQueries(['attendance-logs'])
      toast.success(`Saved for ${emp.full_name}`)
    } catch { toast.error('Failed to save') }
    finally { setSaving(p => ({ ...p, [key]: false })) }
  }

  const statusColor = (status) => {
    const s = STATUS_OPTIONS.find(o => o.value === status)
    return s?.color || 'text-gray-500'
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Manual Attendance</h1>
        <p className="text-sm text-gray-500">Add or update attendance records for any employee</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4">
        <div className="flex gap-4 flex-wrap items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Date</label>
            <input type="date" value={date} onChange={e => { setDate(e.target.value); setEdits({}) }}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Employee</label>
            <select value={empId} onChange={e => { setEmpId(e.target.value); setEdits({}) }}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">All employees</option>
              {employees.filter(e => e.is_active).map(e => (
                <option key={e.id} value={e.id}>{e.full_name}</option>
              ))}
            </select>
          </div>
          <div className="text-xs text-gray-400">
            {data && `${data.employees?.length || 0} employees · ${new Date(date).toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-3 mb-4 flex-wrap">
        {STATUS_OPTIONS.map(s => (
          <span key={s.value} className={`text-xs px-2 py-0.5 rounded-full bg-gray-50 border border-gray-100 ${s.color}`}>
            {s.label}
          </span>
        ))}
        <span className="text-xs px-2 py-0.5 rounded-full bg-orange-50 text-orange-600 border border-orange-100">
          ⚠ Modified — unsaved
        </span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading...</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['Employee', 'Department', 'Shift (Expected)', 'Status', 'Check In', 'Check Out', 'Remarks', 'Action'].map(h => (
                  <th key={h} className="text-left text-xs font-medium text-gray-500 px-4 py-3 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data?.employees?.map(emp => {
                const changed = hasChanged(emp)
                const currentStatus = getEdit(emp.employee_id, 'status') || emp.status
                return (
                  <tr key={emp.employee_id} className={`hover:bg-gray-50 ${changed ? 'bg-orange-50' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-medium flex-shrink-0">
                          {emp.full_name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{emp.full_name}</p>
                          <p className="text-xs text-gray-400">{emp.employee_code}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{emp.department}</td>
                    <td className="px-4 py-3">
                      <p className="text-xs font-medium text-gray-700">{emp.shift_name}</p>
                      {emp.shift_start && (
                        <p className="text-xs text-gray-400">{emp.shift_start?.slice(0,5)} – {emp.shift_end?.slice(0,5)}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <select value={currentStatus}
                        onChange={e => setEdit(emp.employee_id, 'status', e.target.value)}
                        className={`border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 ${statusColor(currentStatus)}`}>
                        {STATUS_OPTIONS.map(s => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <input type="time" value={getEdit(emp.employee_id, 'check_in_time')}
                        onChange={e => setEdit(emp.employee_id, 'check_in_time', e.target.value)}
                        className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 w-28" />
                      {emp.shift_start && (
                        <p className="text-xs text-gray-300 mt-0.5">Expected: {emp.shift_start?.slice(0,5)}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <input type="time" value={getEdit(emp.employee_id, 'check_out_time')}
                        onChange={e => setEdit(emp.employee_id, 'check_out_time', e.target.value)}
                        className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 w-28" />
                      {emp.shift_end && (
                        <p className="text-xs text-gray-300 mt-0.5">Expected: {emp.shift_end?.slice(0,5)}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <input type="text" value={getEdit(emp.employee_id, 'remarks')}
                        onChange={e => setEdit(emp.employee_id, 'remarks', e.target.value)}
                        placeholder="Reason..."
                        className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 w-32" />
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => save(emp)}
                        disabled={saving[emp.employee_id]}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          changed
                            ? 'bg-blue-600 text-white hover:bg-blue-700'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}>
                        {saving[emp.employee_id] ? 'Saving...' : changed ? '💾 Save' : 'Save'}
                      </button>
                    </td>
                  </tr>
                )
              })}
              {!data?.employees?.length && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                    No employees found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Info box */}
      <div className="mt-4 p-4 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-700">
        <p className="font-medium mb-1">How to use:</p>
        <p>1. Select date and employee (or leave All employees to see everyone)</p>
        <p>2. Edit Check-in / Check-out time, Status, and Remarks for any employee</p>
        <p>3. Row turns orange when modified — click <strong>💾 Save</strong> to confirm</p>
        <p>4. Shift start/end time shown as reference below each time field</p>
      </div>
    </div>
  )
}
