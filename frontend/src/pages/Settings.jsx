import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { settingsAPI, departmentAPI, shiftAPI, leaveAPI } from '../api'
import toast from 'react-hot-toast'

const tabs = ['General', 'Offices & Geofencing', 'Kiosk Devices', 'Departments', 'Shifts', 'Holidays', 'Leave Types', 'Email & Notifications']

function EmailSettings() {
  const API = import.meta.env.VITE_API_URL || 'http://localhost:8002'
  const authHeader = () => {
    const token = localStorage.getItem('token')
    return { headers: { Authorization: `Bearer ${token}` } }
  }
  const [testEmail, setTestEmail] = useState('')
  const [loading, setLoading] = useState({})
  const [results, setResults] = useState({})
  const [scheduleForm, setScheduleForm] = useState({
    absent_alert_time: '11:30',
    daily_summary_time: '19:00',
    schedule_days: 'mon-sat',
  })
  const [scheduleSaved, setScheduleSaved] = useState(false)

  const [smtpForm, setSmtpForm] = useState({
    smtp_host: 'smtp.gmail.com', smtp_port: 587, smtp_user: '',
    smtp_password: '', smtp_from_name: 'AttendPro System', admin_email: ''
  })
  const [smtpSaved, setSmtpSaved] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem('token')
    fetch(`${API}/api/settings/`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => {
        setSmtpForm(f => ({
          ...f,
          smtp_host: d.smtp_host || 'smtp.gmail.com',
          smtp_port: d.smtp_port || 587,
          smtp_user: d.smtp_user || '',
          smtp_password: '',
          smtp_from_name: d.smtp_from_name || 'AttendPro System',
          admin_email: d.admin_email || '',
          testEmail: d.admin_email || '',
        }))
        if (d.admin_email) setTestEmail(d.admin_email)
      setScheduleForm(f => ({
        ...f,
        absent_alert_time: d.absent_alert_time || '11:30',
        daily_summary_time: d.daily_summary_time || '19:00',
        schedule_days: d.schedule_days || 'mon-sat',
      }))
      }).catch(() => {})
  }, [])

  const saveSmtp = async () => {
    const token = localStorage.getItem('token')
    try {
      await fetch(`${API}/api/settings/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(smtpForm)
      })
      setSmtpSaved(true)
      setTimeout(() => setSmtpSaved(false), 3000)
    } catch { alert('Failed to save SMTP settings') }
  }

  const saveSchedule = async () => {
    const token = localStorage.getItem('token')
    try {
      await fetch(`${API}/api/settings/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(scheduleForm)
      })
      setScheduleSaved(true)
      setTimeout(() => setScheduleSaved(false), 3000)
    } catch { alert('Failed to save schedule') }
  }

  const run = async (key, fn) => {
    setLoading(l => ({ ...l, [key]: true }))
    setResults(r => ({ ...r, [key]: null }))
    try {
      const res = await fn()
      setResults(r => ({ ...r, [key]: { success: true, data: res.data || res, msg: JSON.stringify(res.data || res) } }))
    } catch (e) {
      setResults(r => ({ ...r, [key]: { success: false, msg: e.response?.data?.detail || e.message } }))
    } finally {
      setLoading(l => ({ ...l, [key]: false }))
    }
  }

  return (
    <div className="space-y-5">
      {/* SMTP Config Form */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <h2 className="font-medium text-gray-900 mb-4">📧 SMTP Email Configuration</h2>
        {smtpSaved && <div className="mb-3 bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded-lg text-sm">✓ SMTP settings saved!</div>}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">SMTP Host</label>
            <input value={smtpForm.smtp_host} onChange={e => setSmtpForm(f => ({...f, smtp_host: e.target.value}))}
              placeholder="smtp.gmail.com"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">SMTP Port</label>
            <input type="number" value={smtpForm.smtp_port} onChange={e => setSmtpForm(f => ({...f, smtp_port: parseInt(e.target.value)}))}
              placeholder="587"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Email (SMTP Username)</label>
            <input type="email" value={smtpForm.smtp_user} onChange={e => setSmtpForm(f => ({...f, smtp_user: e.target.value}))}
              placeholder="attendpro3@gmail.com"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">App Password</label>
            <input type="password" value={smtpForm.smtp_password} onChange={e => setSmtpForm(f => ({...f, smtp_password: e.target.value}))}
              placeholder="Gmail App Password"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">From Name</label>
            <input value={smtpForm.smtp_from_name} onChange={e => setSmtpForm(f => ({...f, smtp_from_name: e.target.value}))}
              placeholder="AttendPro System"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Admin Email (receives summaries)</label>
            <input type="email" value={smtpForm.admin_email} onChange={e => setSmtpForm(f => ({...f, admin_email: e.target.value}))}
              placeholder="admin@company.com"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
          💡 For Gmail: Enable 2FA → Google Account → Security → App Passwords → Generate for "Mail"
        </div>
        <button onClick={saveSmtp}
          className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors">
          💾 Save SMTP Settings
        </button>
      </div>

      {/* Test Actions */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <h2 className="font-medium text-gray-900 mb-4">Email Notifications</h2>
        <div className="space-y-4">
          {/* Test Email */}
          <div className="flex gap-3 items-end p-4 bg-gray-50 rounded-lg">
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">Test Email Address</label>
              <input type="email" value={testEmail} onChange={e => setTestEmail(e.target.value)}
                placeholder="your@email.com"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <button disabled={loading.test || !testEmail}
              onClick={() => run('test', () => fetch(`${API}/api/payroll/notifications/test`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeader().headers },
                body: JSON.stringify({ to_email: testEmail })
              }).then(r => r.json()))}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
              {loading.test ? 'Sending…' : '📧 Send Test'}
            </button>
          </div>
          {results.test && <p className={`text-xs px-3 py-2 rounded-lg ${results.test.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>{results.test.success ? '✓ Test email sent!' : `✗ ${results.test.msg}`}</p>}

          {/* Absent Alerts */}
          <div className="flex justify-between items-center p-4 bg-red-50 rounded-lg">
            <div>
              <p className="text-sm font-medium text-gray-800">🚨 Send Absent Alerts</p>
              <p className="text-xs text-gray-500">Email all employees absent today</p>
            </div>
            <button disabled={loading.absent}
              onClick={() => run('absent', () => fetch(`${API}/api/payroll/notifications/absent-alerts`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeader().headers }
              }).then(r => r.json()))}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
              {loading.absent ? 'Sending…' : 'Send Now'}
            </button>
          </div>
          {results.absent && <p className={`text-xs px-3 py-2 rounded-lg bg-green-50 text-green-700`}>✓ Sent to {results.absent.data?.total_sent ?? 0} employee(s)</p>}

          {/* Daily Summary */}
          <div className="flex justify-between items-center p-4 bg-green-50 rounded-lg">
            <div>
              <p className="text-sm font-medium text-gray-800">📊 Send Daily Summary</p>
              <p className="text-xs text-gray-500">Send attendance report to admin</p>
            </div>
            <button disabled={loading.summary}
              onClick={() => run('summary', () => fetch(`${API}/api/payroll/notifications/daily-summary`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeader().headers }
              }).then(r => r.json()))}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
              {loading.summary ? 'Sending…' : 'Send Now'}
            </button>
          </div>
          {results.summary && <p className={`text-xs px-3 py-2 rounded-lg ${results.summary.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>{results.summary.success ? '✓ Daily summary sent to admin!' : `✗ ${results.summary.msg}`}</p>}
        </div>

        {/* Schedule Config */}
        <div className="mt-5 border-t border-gray-100 pt-4">
          <p className="text-xs font-medium text-gray-700 mb-3">🕐 Automated Schedule Configuration</p>
          {scheduleSaved && <div className="mb-3 bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded-lg text-sm">✓ Schedule saved! Restart backend to apply.</div>}
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 bg-red-50 rounded-lg">
              <span className="text-lg">🚨</span>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-800">Absent Alerts → Employees</p>
              </div>
              <input type="time" value={scheduleForm.absent_alert_time}
                onChange={e => setScheduleForm(f => ({...f, absent_alert_time: e.target.value}))}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
              <span className="text-lg">📊</span>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-800">Daily Summary → Admin</p>
              </div>
              <input type="time" value={scheduleForm.daily_summary_time}
                onChange={e => setScheduleForm(f => ({...f, daily_summary_time: e.target.value}))}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
              <span className="text-lg">📅</span>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-800">Working Days</p>
                <p className="text-xs text-gray-500">Applies to both alerts above</p>
              </div>
              <select value={scheduleForm.schedule_days}
                onChange={e => setScheduleForm(f => ({...f, schedule_days: e.target.value}))}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="mon-fri">Mon–Fri (5 days)</option>
                <option value="mon-sat">Mon–Sat (6 days)</option>
              </select>
            </div>
          </div>
          <button onClick={saveSchedule}
            className="mt-3 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors">
            💾 Save Schedule
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Settings() {
  const [activeTab, setActiveTab] = useState('General')
  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500">Manage company settings, offices, security and devices</p>
      </div>
      <div className="flex gap-1 mb-6 border-b border-gray-100 overflow-x-auto scrollbar-none flex-wrap">
        {tabs.map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${activeTab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t}
          </button>
        ))}
      </div>
      {activeTab === 'General' && <GeneralSettings />}
      {activeTab === 'Offices & Geofencing' && <OfficesGeofencing />}
      {activeTab === 'Kiosk Devices' && <KioskDevices />}
      {activeTab === 'Departments' && <DepartmentSettings />}
      {activeTab === 'Shifts' && <ShiftSettings />}
      {activeTab === 'Holidays' && <HolidaySettings />}
      {activeTab === 'Leave Types' && <LeaveTypeSettings />}
      {activeTab === 'Email & Notifications' && <EmailSettings />}
    </div>
  )
}

function GeneralSettings() {
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => settingsAPI.get().then(r => r.data) })
  const { data: timezones = [] } = useQuery({ queryKey: ['timezones'], queryFn: () => settingsAPI.getTimezones().then(r => r.data) })
  const qc = useQueryClient()
  const [form, setForm] = useState({
    company_name: '', company_email: '', company_address: '', timezone: 'Asia/Kolkata',
    work_hours: 8, lunch_minutes: 30,
    early_leave_enabled: true, early_leave_allowed_per_month: 3,
    early_leave_penalty_type: 'attendance', early_leave_penalty_amount: 1,
    working_days_per_week: 5
  })
  useEffect(() => { 
    if (settings) setForm({ ...settings, company_address: settings.company_address || '' }) 
  }, [settings])

  const save = async () => {
    try { await settingsAPI.update(form); qc.invalidateQueries(['settings']); toast.success('Settings saved') }
    catch { toast.error('Failed to save') }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
        <h2 className="font-medium text-gray-900">Company Information</h2>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Company Name</label>
          <input value={form.company_name || ''} onChange={e => setForm(p => ({ ...p, company_name: e.target.value }))}
            placeholder="Your Company Name"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Company Email</label>
          <input value={form.company_email || ''} onChange={e => setForm(p => ({ ...p, company_email: e.target.value }))}
            placeholder="admin@company.com"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Company Address <span className="text-gray-400">(shown on payslips)</span></label>
          <input value={form.company_address || ''} onChange={e => setForm(p => ({ ...p, company_address: e.target.value }))}
            placeholder="123 Street, City - 700001"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Timezone</label>
          <select value={form.timezone || 'Asia/Kolkata'} onChange={e => setForm(p => ({ ...p, timezone: e.target.value }))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            {timezones.map(tz => <option key={tz} value={tz}>{tz}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
        <h2 className="font-medium text-gray-900">Work Hours & Early Leave</h2>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Working Days</label>
          <select value={form.working_days_per_week || 5} onChange={e => setForm(p => ({ ...p, working_days_per_week: parseInt(e.target.value) }))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value={5}>Monday to Friday (5 days)</option>
            <option value={6}>Monday to Saturday (6 days)</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Work Hours (per day)</label>
            <input type="number" min="1" max="12" step="0.5" value={form.work_hours}
              onChange={e => setForm(p => ({ ...p, work_hours: parseFloat(e.target.value) }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Lunch Break (minutes)</label>
            <input type="number" min="0" max="120" value={form.lunch_minutes}
              onChange={e => setForm(p => ({ ...p, lunch_minutes: parseInt(e.target.value) }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        <div className="p-3 bg-blue-50 rounded-lg text-xs text-blue-700">
          Total required time in office: <strong>{form.work_hours}h {form.lunch_minutes}min</strong> ({(form.work_hours + form.lunch_minutes/60).toFixed(1)} hours total)
        </div>

        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100">
          <div>
            <p className="text-sm font-medium text-gray-900">Early Leave Tracking</p>
            <p className="text-xs text-gray-500 mt-0.5">Flag employees who leave before required hours</p>
          </div>
          <button onClick={() => setForm(p => ({ ...p, early_leave_enabled: !p.early_leave_enabled }))}
            className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${form.early_leave_enabled ? 'bg-blue-600' : 'bg-gray-200'}`}>
            <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${form.early_leave_enabled ? 'left-7' : 'left-1'}`} />
          </button>
        </div>

        {form.early_leave_enabled && (
          <div className="space-y-4 border-t border-gray-100 pt-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Allowed early leaves per month</label>
              <input type="number" min="0" max="31" value={form.early_leave_allowed_per_month}
                onChange={e => setForm(p => ({ ...p, early_leave_allowed_per_month: parseInt(e.target.value) }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <p className="text-xs text-gray-400 mt-1">If employee exceeds this, penalty applies</p>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Penalty type</label>
              <select value={form.early_leave_penalty_type}
                onChange={e => setForm(p => ({ ...p, early_leave_penalty_type: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="attendance">Attendance day deduction</option>
                <option value="money">Money deduction (₹)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                {form.early_leave_penalty_type === 'money' ? 'Penalty amount (₹ per early leave)' : 'Days to deduct per extra early leave'}
              </label>
              <input type="number" min="0" step={form.early_leave_penalty_type === 'money' ? '100' : '1'} value={form.early_leave_penalty_amount}
                onChange={e => setForm(p => ({ ...p, early_leave_penalty_amount: parseFloat(e.target.value) }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="p-3 bg-amber-50 rounded-lg text-xs text-amber-700">
              Example: If allowed = 3 and penalty = 1 day, employee with 5 early leaves gets <strong>2 days deducted</strong> from attendance.
            </div>
          </div>
        )}
      </div>

      <button onClick={save} className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 transition-colors">
        Save All Settings
      </button>
    </div>
  )
}

function OfficesGeofencing() {
  const qc = useQueryClient()
  const { data: geoSettings } = useQuery({ queryKey: ['geofencing'], queryFn: () => settingsAPI.getGeofencing().then(r => r.data) })
  const { data: offices = [], refetch: refetchOffices } = useQuery({ queryKey: ['offices'], queryFn: () => settingsAPI.getOffices().then(r => r.data) })
  const [geofencingEnabled, setGeofencingEnabled] = useState(false)
  const [showAddOffice, setShowAddOffice] = useState(false)
  const [editingOffice, setEditingOffice] = useState(null)
  const [officeForm, setOfficeForm] = useState({ name: '', address: '', lat: '', lng: '', radius_meters: 50, geofencing_enabled: false })
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)

  useEffect(() => { if (geoSettings) setGeofencingEnabled(geoSettings.geofencing_enabled) }, [geoSettings])

  const toggleGeofencing = async () => {
    const newVal = !geofencingEnabled
    setGeofencingEnabled(newVal)
    try {
      await settingsAPI.updateGeofencing({ geofencing_enabled: newVal })
      qc.invalidateQueries(['geofencing'])
      toast.success(newVal ? 'Geofencing enabled' : 'Geofencing disabled')
    } catch { toast.error('Failed to update') }
  }

  const searchAddress = async () => {
    if (!searchQuery) return
    setSearching(true)
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&limit=1`)
      const data = await res.json()
      if (data.length > 0) {
        setOfficeForm(p => ({ ...p, lat: parseFloat(data[0].lat).toFixed(6), lng: parseFloat(data[0].lon).toFixed(6), address: data[0].display_name }))
        toast.success('Location found!')
      } else { toast.error('Address not found') }
    } catch { toast.error('Search failed') }
    finally { setSearching(false) }
  }

  const useCurrentLocation = () => {
    navigator.geolocation.getCurrentPosition(
      pos => { setOfficeForm(p => ({ ...p, lat: pos.coords.latitude.toFixed(6), lng: pos.coords.longitude.toFixed(6) })); toast.success('Location captured!') },
      () => toast.error('Location access denied')
    )
  }

  const saveOffice = async () => {
    if (!officeForm.name) { toast.error('Enter office name'); return }
    try {
      if (editingOffice) {
        await settingsAPI.updateOffice(editingOffice.id, { ...officeForm, lat: parseFloat(officeForm.lat), lng: parseFloat(officeForm.lng) })
        toast.success('Office updated')
      } else {
        await settingsAPI.createOffice({ ...officeForm, lat: parseFloat(officeForm.lat), lng: parseFloat(officeForm.lng) })
        toast.success('Office added')
      }
      setShowAddOffice(false); setEditingOffice(null)
      setOfficeForm({ name: '', address: '', lat: '', lng: '', radius_meters: 50, geofencing_enabled: false })
      refetchOffices()
    } catch { toast.error('Failed to save office') }
  }

  const deleteOffice = async (id) => {
    try { await settingsAPI.deleteOffice(id); refetchOffices(); toast.success('Office deleted') }
    catch { toast.error('Cannot delete') }
  }

  const startEdit = (office) => {
    setEditingOffice(office)
    setOfficeForm({ name: office.name, address: office.address || '', lat: office.lat || '', lng: office.lng || '', radius_meters: office.radius_meters, geofencing_enabled: office.geofencing_enabled || false })
    setShowAddOffice(true)
  }

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
        <p className="text-sm text-blue-800 font-medium">📍 Per-Office Geofencing</p>
        <p className="text-xs text-blue-600 mt-1">Each office has its own geofencing toggle. Enable it per office when adding or editing. Employees assigned to that office must be within the radius to mark attendance via personal kiosk.</p>
      </div>

      {/* Offices list */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-medium text-gray-900">Office Locations</h2>
          <button onClick={() => { setShowAddOffice(true); setEditingOffice(null); setOfficeForm({ name: '', address: '', lat: '', lng: '', radius_meters: 50 }) }}
            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
            + Add Office
          </button>
        </div>

        {offices.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <p className="text-3xl mb-2">🏢</p>
            <p className="text-sm">No offices added yet</p>
            <p className="text-xs mt-1">Add your office locations to enable geofencing</p>
          </div>
        ) : (
          <div className="space-y-3">
            {offices.map(o => (
              <div key={o.id} className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-medium text-gray-900 text-sm">{o.name}</p>
                    {o.address && <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{o.address}</p>}
                    <div className="flex gap-3 mt-2 flex-wrap">
                      {o.lat && o.lng ? (
                        <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                          📍 {o.lat}, {o.lng}
                        </span>
                      ) : (
                        <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">⚠ No GPS set</span>
                      )}
                      <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">Radius: {o.radius_meters}m</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${o.geofencing_enabled ? 'text-purple-600 bg-purple-50' : 'text-gray-400 bg-gray-50'}`}>
                        {o.geofencing_enabled ? '🔒 Geofencing ON' : '🔓 Geofencing OFF'}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2 ml-3">
                    <button onClick={() => startEdit(o)} className="text-xs text-blue-600 hover:text-blue-800">Edit</button>
                    <button onClick={() => deleteOffice(o.id)} className="text-xs text-red-500 hover:text-red-700">Delete</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit office form */}
      {showAddOffice && (
        <div className="bg-white rounded-xl border border-blue-200 p-5">
          <h3 className="font-medium text-gray-900 mb-4">{editingOffice ? 'Edit Office' : 'Add New Office'}</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Office Name *</label>
              <input value={officeForm.name} onChange={e => setOfficeForm(p => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Kolkata HQ / Dantan Branch"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Search address</label>
              <div className="flex gap-2">
                <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && searchAddress()}
                  placeholder="Search address to auto-fill GPS coordinates"
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <button onClick={searchAddress} disabled={searching}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                  {searching ? '...' : 'Search'}
                </button>
              </div>
            </div>
            <button onClick={useCurrentLocation}
              className="w-full border border-gray-200 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50">
              📍 Use my current location
            </button>
            {officeForm.address && (
              <div className="p-2 bg-blue-50 rounded-lg text-xs text-blue-700">📍 {officeForm.address}</div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Latitude</label>
                <input value={officeForm.lat} onChange={e => setOfficeForm(p => ({ ...p, lat: e.target.value }))}
                  placeholder="22.572646"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Longitude</label>
                <input value={officeForm.lng} onChange={e => setOfficeForm(p => ({ ...p, lng: e.target.value }))}
                  placeholder="88.363895"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Allowed radius: {officeForm.radius_meters}m</label>
              <input type="range" min="25" max="500" step="25" value={officeForm.radius_meters}
                onChange={e => setOfficeForm(p => ({ ...p, radius_meters: parseInt(e.target.value) }))}
                className="w-full" />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>25m (strict)</span><span>250m</span><span>500m (loose)</span>
              </div>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-700">Geofencing for this office</p>
                <p className="text-xs text-gray-400">Employees assigned to this office must be within radius</p>
              </div>
              <button onClick={() => setOfficeForm(p => ({ ...p, geofencing_enabled: !p.geofencing_enabled }))}
                className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${officeForm.geofencing_enabled ? 'bg-blue-600' : 'bg-gray-200'}`}>
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${officeForm.geofencing_enabled ? 'left-6' : 'left-1'}`} />
              </button>
            </div>
            <div className="flex gap-2">
              <button onClick={saveOffice} className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700">
                {editingOffice ? 'Update Office' : 'Save Office'}
              </button>
              <button onClick={() => { setShowAddOffice(false); setEditingOffice(null) }}
                className="px-4 border border-gray-200 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function KioskDevices() {
  const { data: devices = [], refetch } = useQuery({ queryKey: ['kiosk-devices'], queryFn: () => settingsAPI.getKioskDevices().then(r => r.data) })
  const { data: offices = [] } = useQuery({ queryKey: ['offices'], queryFn: () => settingsAPI.getOffices().then(r => r.data) })
  const [name, setName] = useState(''); const [ip, setIp] = useState(''); const [officeId, setOfficeId] = useState('')
  const [myIp, setMyIp] = useState('')
  useEffect(() => { settingsAPI.getMyIp().then(r => setMyIp(r.data.ip)).catch(() => {}) }, [])

  const add = async () => {
    if (!name || !ip) { toast.error('Enter device name and IP'); return }
    try {
      await settingsAPI.addKioskDevice({ name, ip, office_id: officeId ? parseInt(officeId) : null })
      setName(''); setIp(''); setOfficeId(''); refetch(); toast.success('Kiosk device registered!')
    } catch { toast.error('Failed to add device') }
  }

  const remove = async (id) => {
    try { await settingsAPI.removeKioskDevice(id); refetch(); toast.success('Device removed') }
    catch { toast.error('Failed') }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <h2 className="font-medium text-gray-900 mb-1">Registered Kiosk Devices</h2>
      <p className="text-xs text-gray-500 mb-4">Only registered IPs can access the kiosk page. Assign each device to an office for location-based geofencing.</p>

      {myIp && (
        <div className="p-3 bg-blue-50 rounded-lg text-xs text-blue-700 mb-4">
          Your current device IP: <strong>{myIp}</strong>
          <button onClick={() => setIp(myIp)} className="ml-2 underline">Use this IP</button>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 mb-4">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Device name (e.g. Main Gate)"
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <input value={ip} onChange={e => setIp(e.target.value)} placeholder="IP (e.g. 192.168.0.190)"
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <select value={officeId} onChange={e => setOfficeId(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Select office (optional)</option>
          {offices.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </div>
      <button onClick={add} className="mb-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
        + Register Device
      </button>

      {devices.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <p className="text-3xl mb-2">🖥️</p>
          <p className="text-sm">No kiosk devices registered</p>
          <p className="text-xs mt-1">If no devices registered — all IPs can access kiosk (open mode)</p>
        </div>
      ) : (
        <div className="space-y-2">
          {devices.map(d => (
            <div key={d.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-900">{d.name}</p>
                <p className="text-xs text-gray-500 font-mono">{d.ip} {d.office_name ? `· ${d.office_name}` : ''}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700">Active</span>
                <button onClick={() => remove(d.id)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 p-3 bg-amber-50 border border-amber-100 rounded-lg text-xs text-amber-700">
        ⚠️ Assign each kiosk to an office so geofencing uses that office's GPS coordinates automatically.
      </div>
    </div>
  )
}

function DepartmentSettings() {
  const { data: depts = [], refetch } = useQuery({ queryKey: ['departments'], queryFn: () => departmentAPI.list().then(r => r.data) })
  const [name, setName] = useState(''); const [desc, setDesc] = useState('')
  const add = async () => {
    if (!name) return
    try { await departmentAPI.create({ name, description: desc }); setName(''); setDesc(''); refetch(); toast.success('Department added') }
    catch { toast.error('Failed') }
  }
  const del = async (id) => {
    try { await departmentAPI.delete(id); refetch(); toast.success('Deleted') }
    catch { toast.error('Cannot delete — employees assigned') }
  }
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <h2 className="font-medium text-gray-900 mb-4">Departments</h2>
      <div className="flex gap-2 mb-4">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Department name"
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Description (optional)"
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <button onClick={add} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">+ Add</button>
      </div>
      <div className="space-y-2">
        {depts.map(d => (
          <div key={d.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div><p className="text-sm font-medium text-gray-900">{d.name}</p><p className="text-xs text-gray-500">{d.description || 'No description'}</p></div>
            <button onClick={() => del(d.id)} className="text-xs text-red-500 hover:text-red-700">Delete</button>
          </div>
        ))}
      </div>
    </div>
  )
}

function ShiftSettings() {
  const { data: shifts = [], refetch } = useQuery({ queryKey: ['shifts'], queryFn: () => shiftAPI.list().then(r => r.data) })
  const [form, setForm] = useState({ name: '', start_time: '09:00', end_time: '18:00', grace_minutes: 15, working_days: 'Mon-Fri' })
  const add = async () => {
    if (!form.name) return
    try { await shiftAPI.create(form); setForm({ name: '', start_time: '09:00', end_time: '18:00', grace_minutes: 15, working_days: 'Mon-Fri' }); refetch(); toast.success('Shift added') }
    catch { toast.error('Failed') }
  }
  const del = async (id) => {
    try { await shiftAPI.delete(id); refetch(); toast.success('Deleted') }
    catch { toast.error('Cannot delete — employees assigned') }
  }
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <h2 className="font-medium text-gray-900 mb-4">Shifts</h2>
      <div className="grid grid-cols-2 gap-3 mb-4">
        {[
          { label: 'Shift name', key: 'name', type: 'text', placeholder: 'Morning Shift' },
          { label: 'Working days', key: 'working_days', type: 'text', placeholder: 'Mon-Fri' },
          { label: 'Start time', key: 'start_time', type: 'time' },
          { label: 'End time', key: 'end_time', type: 'time' },
          { label: 'Grace minutes', key: 'grace_minutes', type: 'number', placeholder: '15' },
        ].map(f => (
          <div key={f.key}>
            <label className="block text-xs text-gray-500 mb-1">{f.label}</label>
            <input type={f.type} value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: f.type === 'number' ? parseInt(e.target.value) : e.target.value }))}
              placeholder={f.placeholder}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        ))}
      </div>
      <button onClick={add} className="mb-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">+ Add Shift</button>
      <div className="space-y-2">
        {shifts.map(s => (
          <div key={s.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="text-sm font-medium text-gray-900">{s.name}</p>
              <p className="text-xs text-gray-500">{s.start_time} – {s.end_time} · {s.working_days} · {s.grace_minutes}min grace</p>
            </div>
            <button onClick={() => del(s.id)} className="text-xs text-red-500 hover:text-red-700">Delete</button>
          </div>
        ))}
      </div>
    </div>
  )
}

function HolidaySettings() {
  const { data: holidays = [], refetch } = useQuery({ queryKey: ['holidays'], queryFn: () => settingsAPI.getHolidays().then(r => r.data) })
  const [form, setForm] = useState({ name: '', date: '', holiday_type: 'national' })

  const add = async () => {
    if (!form.name || !form.date) { toast.error('Enter name and date'); return }
    try {
      await settingsAPI.addHoliday(form)
      setForm({ name: '', date: '', holiday_type: 'national' })
      refetch()
      toast.success('Holiday added')
    } catch { toast.error('Failed') }
  }

  const del = async (id) => {
    try { await settingsAPI.deleteHoliday(id); refetch(); toast.success('Deleted') }
    catch { toast.error('Failed') }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <h2 className="font-medium text-gray-900 mb-4">Holiday Calendar</h2>
      <div className="flex gap-2 mb-4 flex-wrap">
        <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
          placeholder="Holiday name (e.g. Diwali)"
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <select value={form.holiday_type} onChange={e => setForm(p => ({ ...p, holiday_type: e.target.value }))}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="national">National</option>
          <option value="regional">Regional</option>
          <option value="office">Office Only</option>
        </select>
        <button onClick={add} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">+ Add</button>
      </div>
      <div className="space-y-2">
        {holidays.length === 0 && <p className="text-center py-8 text-gray-400 text-sm">No holidays added yet</p>}
        {holidays.map(h => (
          <div key={h.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="text-sm font-medium text-gray-900">{h.name}</p>
              <p className="text-xs text-gray-500">{new Date(h.date).toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} · {h.holiday_type}</p>
            </div>
            <button onClick={() => del(h.id)} className="text-xs text-red-500 hover:text-red-700">Delete</button>
          </div>
        ))}
      </div>
    </div>
  )
}

function LeaveTypeSettings() {
  const { data: types = [], refetch } = useQuery({ queryKey: ['leave-types'], queryFn: () => leaveAPI.types().then(r => r.data) })
  const [form, setForm] = useState({ name: '', days_per_year: 12, is_paid: true })
  const [editingId, setEditingId] = useState(null)

  const save = async () => {
    if (!form.name) { toast.error('Enter leave type name'); return }
    try {
      if (editingId) {
        await leaveAPI.updateType(editingId, form)
        setEditingId(null)
        toast.success('Updated')
      } else {
        await leaveAPI.createType(form)
        toast.success('Leave type added')
      }
      setForm({ name: '', days_per_year: 12, is_paid: true })
      refetch()
    } catch { toast.error('Failed') }
  }

  const del = async (id) => {
    if (!window.confirm('Delete this leave type?')) return
    try { await leaveAPI.deleteType(id); refetch(); toast.success('Deleted') }
    catch { toast.error('Cannot delete — may have existing requests') }
  }

  const startEdit = (lt) => {
    setEditingId(lt.id)
    setForm({ name: lt.name, days_per_year: lt.days_per_year, is_paid: lt.is_paid })
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <h2 className="font-medium text-gray-900 mb-1">Leave Types</h2>
      <p className="text-xs text-gray-500 mb-4">Configure leave types available to employees. These will appear in the Leave application form.</p>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Leave Type Name</label>
          <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            placeholder="e.g. Casual Leave, Sick Leave"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Days per year</label>
          <input type="number" min="1" max="365" value={form.days_per_year}
            onChange={e => setForm(p => ({ ...p, days_per_year: parseInt(e.target.value) }))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Type</label>
          <select value={form.is_paid} onChange={e => setForm(p => ({ ...p, is_paid: e.target.value === 'true' }))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="true">Paid Leave</option>
            <option value="false">Unpaid Leave</option>
          </select>
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        <button onClick={save} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
          {editingId ? 'Update Leave Type' : '+ Add Leave Type'}
        </button>
        {editingId && (
          <button onClick={() => { setEditingId(null); setForm({ name: '', days_per_year: 12, is_paid: true }) }}
            className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
        )}
      </div>

      <div className="space-y-2">
        {types.length === 0 && <p className="text-center py-8 text-gray-400 text-sm">No leave types added yet</p>}
        {types.map(lt => (
          <div key={lt.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="text-sm font-medium text-gray-900">{lt.name}</p>
              <p className="text-xs text-gray-500">{lt.days_per_year} days/year · {lt.is_paid ? 'Paid' : 'Unpaid'}</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => startEdit(lt)} className="text-xs text-blue-600 hover:text-blue-800">Edit</button>
              <button onClick={() => del(lt.id)} className="text-xs text-red-500 hover:text-red-700">Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
