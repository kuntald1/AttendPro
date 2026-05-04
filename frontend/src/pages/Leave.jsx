import { useState, useEffect } from 'react'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8002'

const authHeader = () => {
  const token = localStorage.getItem('token')
  return { headers: { Authorization: `Bearer ${token}` } }
}

const STATUS_COLORS = {
  pending:  'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
}

const STATUS_ICONS = { pending: '⏳', approved: '✅', rejected: '❌' }

export default function Leave() {
  const [role, setRole]         = useState('employee')
  const [leaves, setLeaves]     = useState([])
  const [types, setTypes]       = useState([])
  const [balances, setBalances] = useState([])
  const [allBalances, setAllBalances] = useState([])
  const [loading, setLoading]   = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [reviewModal, setReviewModal] = useState(null)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterEmp, setFilterEmp] = useState('')
  const [employees, setEmployees] = useState([])
  const [activeTab, setActiveTab] = useState('requests') // requests | balances
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [filterBalEmp, setFilterBalEmp] = useState('')

  const [confirmCancel, setConfirmCancel] = useState(null)

  const deleteLeave = async (id) => {
    try {
      await axios.delete(`${API}/api/leave/${id}`, authHeader())
      setSuccess('Leave request cancelled.')
      setConfirmCancel(null)
      fetchLeaves()
      fetchBalances()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to cancel leave')
      setConfirmCancel(null)
    }
  }

  const [form, setForm] = useState({
    leave_type_id: '', from_date: '', to_date: '', reason: ''
  })
  const [reviewForm, setReviewForm] = useState({ status: 'approved', remarks: '' })

  useEffect(() => {
    axios.get(`${API}/api/auth/me`, authHeader())
      .then(r => { setRole(r.data?.role || 'employee') })
      .catch(() => {})
    fetchLeaves()
    fetchTypes()
    fetchBalances()
  }, [])

  useEffect(() => {
    if (['admin','hr','manager'].includes(role)) {
      axios.get(`${API}/api/employees/`, authHeader()).then(r => setEmployees(r.data || [])).catch(() => {})
      fetchAllBalances()
    }
  }, [role])

  const isAdmin = ['admin', 'hr', 'manager'].includes(role)

  const fetchLeaves = async () => {
    setLoading(true)
    try {
      const params = {}
      if (filterStatus) params.status = filterStatus
      if (filterEmp && isAdmin) params.employee_id = filterEmp
      const res = await axios.get(`${API}/api/leave/`, { ...authHeader(), params })
      setLeaves(res.data || [])
    } catch { setError('Failed to load leaves') }
    finally { setLoading(false) }
  }

  const fetchTypes = async () => {
    const res = await axios.get(`${API}/api/leave/types`, authHeader()).catch(() => ({ data: [] }))
    setTypes(res.data || [])
  }

  const fetchBalances = async () => {
    const res = await axios.get(`${API}/api/leave/balance`, authHeader()).catch(() => ({ data: {} }))
    setBalances(res.data?.balances || [])
  }

  const fetchAllBalances = async () => {
    const res = await axios.get(`${API}/api/leave/all-balances`, authHeader()).catch(() => ({ data: {} }))
    setAllBalances(res.data?.employees || [])
  }

  useEffect(() => { fetchLeaves() }, [filterStatus, filterEmp])

  const applyLeave = async (e) => {
    e.preventDefault()
    setError('')
    try {
      await axios.post(`${API}/api/leave/apply`, {
        ...form,
        leave_type_id: parseInt(form.leave_type_id),
      }, authHeader())
      setSuccess('Leave applied successfully! Admin has been notified via email.')
      setShowForm(false)
      setForm({ leave_type_id: '', from_date: '', to_date: '', reason: '' })
      fetchLeaves()
      fetchBalances()
      setTimeout(() => setSuccess(''), 5000)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to apply leave')
    }
  }

  const reviewLeave = async () => {
    try {
      await axios.patch(`${API}/api/leave/${reviewModal.id}/review`, reviewForm, authHeader())
      setSuccess(`Leave ${reviewForm.status}! Employee has been notified via email.`)
      setReviewModal(null)
      fetchLeaves()
      fetchAllBalances()
      setTimeout(() => setSuccess(''), 5000)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to review leave')
    }
  }

  const daysCount = (from, to) => {
    if (!from || !to) return 0
    return Math.max(1, (new Date(to) - new Date(from)) / 86400000 + 1)
  }

  const selectedType = types.find(t => t.id === parseInt(form.leave_type_id))
  const selectedBal = balances.find(b => b.leave_type === selectedType?.name)

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Leave Management</h1>
          <p className="text-sm text-gray-500">{leaves.length} request(s)</p>
        </div>
        <button onClick={() => { setShowForm(true); setError('') }}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          + Apply Leave
        </button>
      </div>

      {success && <div className="mb-4 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg text-sm">✓ {success}</div>}
      {error && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">✗ {error} <button onClick={() => setError('')} className="ml-2 text-red-400">×</button></div>}

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-gray-100 rounded-lg p-1 w-fit">
        <button onClick={() => setActiveTab('requests')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'requests' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
          📋 Leave Requests
        </button>
        <button onClick={() => setActiveTab('balances')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'balances' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
          📊 Leave Balance
        </button>
      </div>

      {/* LEAVE REQUESTS TAB */}
      {activeTab === 'requests' && (
        <>
          {/* Filters */}
          <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4 flex gap-3 flex-wrap">
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">All Status</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
            {isAdmin && (
              <select value={filterEmp} onChange={e => setFilterEmp(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">All Employees</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </select>
            )}
            <button onClick={fetchLeaves} className="bg-blue-50 hover:bg-blue-100 text-blue-600 px-4 py-2 rounded-lg text-sm transition-colors">
              🔍 Filter
            </button>
          </div>

          {/* Leave Table */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {isAdmin && <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Employee</th>}
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Leave Type</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">From</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">To</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Days</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Reason</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Applied</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Status</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>
                ) : leaves.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">No leave requests found</td></tr>
                ) : leaves.map(l => (
                  <tr key={l.id} className="hover:bg-gray-50">
                    {isAdmin && (
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{l.employee?.full_name || '—'}</p>
                        <p className="text-xs text-gray-400">{l.employee?.employee_code}</p>
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <span className="text-xs font-medium bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                        {l.leave_type?.name || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{l.from_date}</td>
                    <td className="px-4 py-3 text-gray-700">{l.to_date}</td>
                    <td className="px-4 py-3 font-semibold text-gray-900">
                      {daysCount(l.from_date, l.to_date)}
                    </td>
                    <td className="px-4 py-3 text-gray-500 max-w-xs truncate">{l.reason || '—'}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {new Date(l.applied_at).toLocaleDateString('en-IN')}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[l.status] || 'bg-gray-100 text-gray-600'}`}>
                        {STATUS_ICONS[l.status]} {l.status}
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
                          <span className="text-xs text-gray-400">Reviewed</span>
                        )}
                      </td>
                    )}
                    {!isAdmin && (
                      <td className="px-4 py-3">
                        {l.status === 'pending' ? (
                          <button onClick={() => setConfirmCancel(l)}
                            className="text-xs bg-red-50 hover:bg-red-100 text-red-600 px-3 py-1.5 rounded-lg transition-colors">
                            Cancel
                          </button>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* LEAVE BALANCE TAB */}
      {activeTab === 'balances' && (
        <div className="space-y-4">
          {/* Employee's own balance */}
          {!isAdmin && (
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <h3 className="font-semibold text-gray-800 mb-4">📊 My Leave Balance — {new Date().getFullYear()}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {balances.map((b, i) => {
                  const pct = b.allowed > 0 ? Math.round((b.used / b.allowed) * 100) : 0
                  const isExhausted = b.remaining === 0 && b.is_paid
                  return (
                    <div key={i} className={`p-4 rounded-xl border-2 ${isExhausted ? 'border-red-200 bg-red-50' : 'border-gray-100 bg-gray-50'}`}>
                      <p className="text-sm font-semibold text-gray-700 mb-1">{b.leave_type}</p>
                      <p className="text-xs text-gray-400 mb-3">{b.is_paid ? 'Paid' : 'Unpaid (LOP)'}</p>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-500">Used: <strong>{b.used}</strong></span>
                        <span className="text-gray-500">Allowed: <strong>{b.allowed}</strong></span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                        <div className={`h-2 rounded-full ${pct >= 100 ? 'bg-red-500' : pct >= 75 ? 'bg-yellow-500' : 'bg-green-500'}`}
                          style={{ width: `${Math.min(100, pct)}%` }} />
                      </div>
                      <p className={`text-sm font-bold ${isExhausted ? 'text-red-600' : 'text-green-600'}`}>
                        {isExhausted ? '⚠ Exhausted' : `${b.remaining} days left`}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Admin — all employee balances */}
          {isAdmin && (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="p-4 border-b border-gray-100 flex justify-between items-center">
                <div>
                  <h3 className="font-semibold text-gray-800">📊 All Employee Leave Balances — {new Date().getFullYear()}</h3>
                  <p className="text-xs text-gray-400 mt-1">Track remaining leave days per employee</p>
                </div>
                <select value={filterBalEmp} onChange={e => setFilterBalEmp(e.target.value)}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">All Employees</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
                </select>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Employee</th>
                      {allBalances[0]?.balances.map((b, i) => (
                        <th key={i} className="text-left text-xs font-medium text-gray-500 px-4 py-3 whitespace-nowrap">
                          {b.leave_type}<br/><span className="text-gray-400 font-normal">({b.allowed}/yr)</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {(filterBalEmp ? allBalances.filter(e => String(e.employee_id) === String(filterBalEmp)) : allBalances).map((emp, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900">{emp.employee_name}</p>
                          <p className="text-xs text-gray-400">{emp.employee_code}</p>
                        </td>
                        {emp.balances.map((b, j) => {
                          const exhausted = b.remaining === 0 && b.is_paid
                          return (
                            <td key={j} className="px-4 py-3">
                              <div className={`text-xs px-2 py-1 rounded-lg text-center ${exhausted ? 'bg-red-50 text-red-700' : b.remaining <= 2 ? 'bg-yellow-50 text-yellow-700' : 'bg-green-50 text-green-700'}`}>
                                {exhausted ? '⚠ 0 left' : `${b.remaining} left`}
                                <span className="block text-gray-400 font-normal">{b.used}/{b.allowed} used</span>
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                    {allBalances.length === 0 && (
                      <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-400">No employees found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* APPLY LEAVE MODAL */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowForm(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md z-10">
            <div className="p-6">
              <div className="flex justify-between items-center mb-5">
                <h2 className="text-lg font-bold text-gray-900">Apply for Leave</h2>
                <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-2xl">×</button>
              </div>

              {error && (
                <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                  ⚠️ {error}
                </div>
              )}

              {/* Balance preview */}
              {selectedBal && (
                <div className={`mb-4 p-3 rounded-lg text-sm ${selectedBal.remaining === 0 && selectedType?.is_paid ? 'bg-red-50 border border-red-200' : 'bg-blue-50 border border-blue-200'}`}>
                  <p className="font-semibold">{selectedType?.name} Balance</p>
                  <p className="text-xs mt-1">
                    Used: <strong>{selectedBal.used}</strong> / {selectedBal.allowed} days &nbsp;|&nbsp;
                    Remaining: <strong className={selectedBal.remaining === 0 ? 'text-red-600' : 'text-green-600'}>{selectedBal.remaining} days</strong>
                  </p>
                  {selectedBal.remaining === 0 && selectedType?.is_paid && (
                    <p className="text-xs text-red-600 mt-1">⚠️ Balance exhausted! Please choose Loss of Pay.</p>
                  )}
                </div>
              )}

              <form onSubmit={applyLeave} className="space-y-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Leave Type *</label>
                  <select required value={form.leave_type_id} onChange={e => setForm(f => ({ ...f, leave_type_id: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">Select type</option>
                    {types.map(t => {
                      const bal = balances.find(b => b.leave_type === t.name)
                      const exhausted = bal && bal.remaining === 0 && t.is_paid
                      return (
                        <option key={t.id} value={t.id} disabled={exhausted}>
                          {t.name} ({t.days_per_year} days/yr){exhausted ? ' — EXHAUSTED' : bal ? ` — ${bal.remaining} left` : ''}
                        </option>
                      )
                    })}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">From Date *</label>
                    <input type="date" required value={form.from_date} onChange={e => setForm(f => ({ ...f, from_date: e.target.value }))}
                      min={new Date().toISOString().split('T')[0]}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">To Date *</label>
                    <input type="date" required value={form.to_date} onChange={e => setForm(f => ({ ...f, to_date: e.target.value }))}
                      min={form.from_date || new Date().toISOString().split('T')[0]}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
                {form.from_date && form.to_date && (
                  <div className="bg-blue-50 rounded-lg px-3 py-2 text-sm text-blue-700">
                    📅 Total: <strong>{daysCount(form.from_date, form.to_date)} day(s)</strong>
                  </div>
                )}
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Reason</label>
                  <textarea value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                    rows={3} placeholder="Briefly describe the reason for leave..."
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
                  📧 Admin will be notified via email when you apply. You'll receive an email when it's reviewed.
                </div>
                <div className="flex gap-3">
                  <button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg font-medium transition-colors">
                    Submit Application
                  </button>
                  <button type="button" onClick={() => setShowForm(false)}
                    className="px-5 py-2.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* REVIEW MODAL */}
      {reviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setReviewModal(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md z-10">
            <div className="p-6">
              <div className="flex justify-between items-center mb-5">
                <h2 className="text-lg font-bold text-gray-900">Review Leave Request</h2>
                <button onClick={() => setReviewModal(null)} className="text-gray-400 hover:text-gray-600 text-2xl">×</button>
              </div>

              {/* Leave details */}
              <div className="bg-gray-50 rounded-xl p-4 mb-5 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div><p className="text-xs text-gray-400">Employee</p><p className="font-semibold">{reviewModal.employee?.full_name}</p></div>
                  <div><p className="text-xs text-gray-400">Leave Type</p><p className="font-semibold">{reviewModal.leave_type?.name}</p></div>
                  <div><p className="text-xs text-gray-400">From</p><p className="font-semibold">{reviewModal.from_date}</p></div>
                  <div><p className="text-xs text-gray-400">To</p><p className="font-semibold">{reviewModal.to_date}</p></div>
                  <div><p className="text-xs text-gray-400">Days</p><p className="font-bold text-blue-600">{daysCount(reviewModal.from_date, reviewModal.to_date)}</p></div>
                  <div><p className="text-xs text-gray-400">Applied</p><p>{new Date(reviewModal.applied_at).toLocaleDateString('en-IN')}</p></div>
                </div>
                {reviewModal.reason && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <p className="text-xs text-gray-400">Reason</p>
                    <p className="text-sm text-gray-700">{reviewModal.reason}</p>
                  </div>
                )}
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
                    rows={2} placeholder="Add a note to the employee..."
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
                  📧 Employee will be notified via email with your decision.
                </div>
                <div className="flex gap-3">
                  <button onClick={reviewLeave}
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
        </div>
      )}

      {/* Cancel Leave Confirm Modal */}
      {confirmCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setConfirmCancel(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm z-10 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center text-2xl">🚫</div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Cancel Leave Request</h3>
                <p className="text-sm text-gray-500">{confirmCancel.leave_type?.name}</p>
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 mb-5 text-sm">
              <p><span className="text-gray-400">Dates: </span><strong>{confirmCancel.from_date} → {confirmCancel.to_date}</strong></p>
              <p><span className="text-gray-400">Days: </span><strong>{daysCount(confirmCancel.from_date, confirmCancel.to_date)}</strong></p>
              {confirmCancel.reason && <p><span className="text-gray-400">Reason: </span>{confirmCancel.reason}</p>}
            </div>
            <p className="text-sm text-gray-600 mb-5">Are you sure you want to cancel this leave request? This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => deleteLeave(confirmCancel.id)}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-lg font-medium transition-colors">
                Yes, Cancel Leave
              </button>
              <button onClick={() => setConfirmCancel(null)}
                className="px-5 py-2.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">
                Keep It
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
