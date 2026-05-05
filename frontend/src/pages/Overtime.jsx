import { useState, useEffect } from 'react'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8002'
const authHeader = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })

const STATUS_COLORS = {
  pending:  'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
}

export default function Overtime() {
  const [role, setRole]         = useState('employee')
  const [otLogs, setOtLogs]     = useState([])
  const [employees, setEmployees] = useState([])
  const [otEnabled, setOtEnabled] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [calcLoading, setCalcLoading] = useState(false)
  const [reviewModal, setReviewModal] = useState(null)
  const [reviewForm, setReviewForm] = useState({ status: 'approved', remarks: '' })
  const [success, setSuccess]   = useState('')
  const [error, setError]       = useState('')
  const [filters, setFilters]   = useState({
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    status: '',
    employee_id: '',
  })
  const [summary, setSummary] = useState(null)

  const isAdmin = ['admin', 'hr', 'manager'].includes(role)

  useEffect(() => {
    axios.get(`${API}/api/auth/me`, authHeader()).then(r => setRole(r.data?.role || 'employee')).catch(() => {})
    axios.get(`${API}/api/overtime/settings`, authHeader()).then(r => setOtEnabled(r.data?.enabled || false)).catch(() => {})
  }, [])

  useEffect(() => {
    if (isAdmin) {
      axios.get(`${API}/api/employees/`, authHeader()).then(r => setEmployees(r.data || [])).catch(() => {})
    }
  }, [role])

  useEffect(() => { fetchOT() }, [filters])

  const fetchOT = async () => {
    setLoading(true)
    try {
      const params = { month: filters.month, year: filters.year }
      if (filters.status) params.status = filters.status
      if (filters.employee_id && isAdmin) params.employee_id = filters.employee_id
      const res = await axios.get(`${API}/api/overtime/`, { ...authHeader(), params })
      setOtLogs(res.data || [])
    } catch { setError('Failed to load OT records') }
    finally { setLoading(false) }
  }

  const calculateOT = async () => {
    setCalcLoading(true)
    setError('')
    try {
      const res = await axios.post(`${API}/api/overtime/calculate`, null, {
        ...authHeader(),
        params: { month: filters.month, year: filters.year }
      })
      setSuccess(`✓ ${res.data.message}`)
      fetchOT()
      setTimeout(() => setSuccess(''), 5000)
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to calculate OT')
    }
    finally { setCalcLoading(false) }
  }

  const reviewOT = async () => {
    try {
      const res = await axios.patch(`${API}/api/overtime/${reviewModal.id}/review`, reviewForm, authHeader())
      setSuccess(`✓ OT ${reviewForm.status}! Amount: ₹${res.data.ot_amount?.toFixed(2) || 0}`)
      setReviewModal(null)
      fetchOT()
      setTimeout(() => setSuccess(''), 5000)
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to review OT')
    }
  }

  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const totalApproved = otLogs.filter(l => l.status === 'approved').reduce((a, l) => a + l.ot_amount, 0)
  const totalHours = otLogs.filter(l => l.status === 'approved').reduce((a, l) => a + l.ot_hours, 0)
  const pendingCount = otLogs.filter(l => l.status === 'pending').length

  if (!otEnabled) return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
        <div className="text-6xl mb-4">⏱</div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">Overtime Tracking Disabled</h2>
        <p className="text-gray-500 mb-4">Overtime tracking is currently turned off.</p>
        {isAdmin && <p className="text-sm text-blue-600">Go to <strong>Settings → Overtime</strong> to enable it.</p>}
      </div>
    </div>
  )

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">⏱ Overtime Management</h1>
          <p className="text-sm text-gray-500">{otLogs.length} record(s) for {months[filters.month - 1]} {filters.year}</p>
        </div>
        {isAdmin && (
          <button onClick={calculateOT} disabled={calcLoading}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2">
            {calcLoading ? '⏳ Calculating…' : '⚡ Calculate OT'}
          </button>
        )}
      </div>

      {success && <div className="mb-4 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg text-sm">✓ {success}</div>}
      {error && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">✗ {error} <button onClick={() => setError('')} className="ml-2">×</button></div>}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        {[
          { label: 'Total Records', value: otLogs.length, color: 'blue' },
          { label: 'Pending Approval', value: pendingCount, color: 'yellow' },
          { label: 'Approved Hours', value: `${totalHours.toFixed(1)}h`, color: 'green' },
          { label: 'Total OT Amount', value: `₹${totalApproved.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, color: 'purple' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-xs text-gray-400 mb-1">{s.label}</p>
            <p className={`text-2xl font-bold text-${s.color}-600`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4 flex gap-3 flex-wrap">
        <select value={filters.month} onChange={e => setFilters(f => ({ ...f, month: parseInt(e.target.value) }))}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          {months.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
        <select value={filters.year} onChange={e => setFilters(f => ({ ...f, year: parseInt(e.target.value) }))}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
        {isAdmin && (
          <select value={filters.employee_id} onChange={e => setFilters(f => ({ ...f, employee_id: e.target.value }))}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">All Employees</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
          </select>
        )}
      </div>

      {/* Info box for admin */}
      {isAdmin && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4 text-sm text-blue-700">
          <strong>How it works:</strong> Click <strong>⚡ Calculate OT</strong> to scan this month's attendance and detect overtime based on checkout time vs shift end time. Then review and approve/reject each record below. Approved OT amount will be added to the employee's payslip automatically.
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {isAdmin && <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Employee</th>}
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Date</th>
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Day Type</th>
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">OT Hours</th>
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Rate</th>
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">OT Amount</th>
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Status</th>
              {isAdmin && <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>
            ) : otLogs.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                {isAdmin ? 'No OT records. Click ⚡ Calculate OT to scan attendance.' : 'No overtime records found.'}
              </td></tr>
            ) : otLogs.map(l => (
              <tr key={l.id} className="hover:bg-gray-50">
                {isAdmin && (
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{l.employee_name}</p>
                    <p className="text-xs text-gray-400">{l.employee_code}</p>
                  </td>
                )}
                <td className="px-4 py-3 text-gray-700">{l.date}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${l.is_weekend ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'}`}>
                    {l.is_weekend ? '🌅 Weekend' : '💼 Weekday'}
                  </span>
                </td>
                <td className="px-4 py-3 font-semibold text-gray-900">
                  {l.ot_hours}h
                  <span className="text-xs text-gray-400 ml-1">({l.ot_minutes} min)</span>
                </td>
                <td className="px-4 py-3 text-gray-600">{l.ot_rate}×</td>
                <td className="px-4 py-3">
                  {l.status === 'approved'
                    ? <span className="font-bold text-green-600">₹{l.ot_amount?.toFixed(2)}</span>
                    : <span className="text-gray-400 text-xs">Pending approval</span>
                  }
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[l.status] || 'bg-gray-100 text-gray-600'}`}>
                    {l.status === 'pending' ? '⏳' : l.status === 'approved' ? '✅' : '❌'} {l.status}
                  </span>
                </td>
                {isAdmin && (
                  <td className="px-4 py-3">
                    {l.status === 'pending' ? (
                      <button onClick={() => { setReviewModal(l); setReviewForm({ status: 'approved', remarks: '' }) }}
                        className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition-colors">
                        Review
                      </button>
                    ) : (
                      <span className="text-xs text-gray-400">{l.remarks || 'Reviewed'}</span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Review Modal */}
      {reviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setReviewModal(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md z-10 p-6">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-lg font-bold text-gray-900">Review Overtime</h2>
              <button onClick={() => setReviewModal(null)} className="text-gray-400 hover:text-gray-600 text-2xl">×</button>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 mb-5 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><p className="text-xs text-gray-400">Employee</p><p className="font-semibold">{reviewModal.employee_name}</p></div>
                <div><p className="text-xs text-gray-400">Date</p><p className="font-semibold">{reviewModal.date}</p></div>
                <div><p className="text-xs text-gray-400">Day Type</p><p className="font-semibold">{reviewModal.is_weekend ? '🌅 Weekend' : '💼 Weekday'}</p></div>
                <div><p className="text-xs text-gray-400">OT Hours</p><p className="font-bold text-blue-600">{reviewModal.ot_hours}h ({reviewModal.ot_minutes} min)</p></div>
                <div><p className="text-xs text-gray-400">Rate</p><p className="font-semibold">{reviewModal.ot_rate}× multiplier</p></div>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-200 bg-blue-50 rounded-lg p-2 text-center">
                <p className="text-xs text-blue-600">OT amount will be calculated on approval and added to payslip</p>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-500 mb-2">Decision *</label>
                <div className="flex gap-3">
                  <button onClick={() => setReviewForm(f => ({ ...f, status: 'approved' }))}
                    className={`flex-1 py-2.5 rounded-lg font-medium text-sm transition-colors ${reviewForm.status === 'approved' ? 'bg-green-600 text-white' : 'bg-green-50 text-green-700 hover:bg-green-100'}`}>
                    ✅ Approve
                  </button>
                  <button onClick={() => setReviewForm(f => ({ ...f, status: 'rejected' }))}
                    className={`flex-1 py-2.5 rounded-lg font-medium text-sm transition-colors ${reviewForm.status === 'rejected' ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700 hover:bg-red-100'}`}>
                    ❌ Reject
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Remarks (optional)</label>
                <textarea value={reviewForm.remarks} onChange={e => setReviewForm(f => ({ ...f, remarks: e.target.value }))}
                  rows={2} placeholder="Add a note..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>
              <div className="flex gap-3">
                <button onClick={reviewOT}
                  className={`flex-1 text-white py-2.5 rounded-lg font-medium transition-colors ${reviewForm.status === 'approved' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}>
                  {reviewForm.status === 'approved' ? '✅ Confirm Approval' : '❌ Confirm Rejection'}
                </button>
                <button onClick={() => setReviewModal(null)}
                  className="px-5 py-2.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
