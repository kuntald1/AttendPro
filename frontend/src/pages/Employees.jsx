import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { employeeAPI, departmentAPI, shiftAPI, settingsAPI } from '../api'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'

export default function Employees() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editEmp, setEditEmp] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [faceEmpId, setFaceEmpId] = useState(null)
  const [faceShots, setFaceShots] = useState([])
  const TOTAL_FACE_SHOTS = 3
  const [officeEmpId, setOfficeEmpId] = useState(null)
  const [officeForm, setOfficeForm] = useState({ office_id: '', kiosk_access: false })
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [form, setForm] = useState({
    employee_code: '', full_name: '', email: '', phone: '',
    designation: '', department_id: '', shift_id: '', joining_date: '', password: '',
    pan_number: '', bank_account: '', bank_name: '', ifsc_code: ''
  })

  const { data: employees = [] } = useQuery({ queryKey: ['employees'], queryFn: () => employeeAPI.list().then(r => r.data) })
  const { data: depts = [] } = useQuery({ queryKey: ['departments'], queryFn: () => departmentAPI.list().then(r => r.data) })
  const { data: shifts = [] } = useQuery({ queryKey: ['shifts'], queryFn: () => shiftAPI.list().then(r => r.data) })
  const { data: offices = [] } = useQuery({ queryKey: ['offices'], queryFn: () => settingsAPI.getOffices().then(r => r.data) })

  const createMutation = useMutation({
    mutationFn: employeeAPI.create,
    onSuccess: () => {
      qc.invalidateQueries(['employees'])
      setShowForm(false)
      setForm({ employee_code: '', full_name: '', email: '', phone: '', designation: '', department_id: '', shift_id: '', joining_date: '', password: '', pan_number: '', bank_account: '', bank_name: '', ifsc_code: '' })
      toast.success('Employee created successfully')
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Failed to create employee'),
  })

  const deleteMutation = useMutation({
    mutationFn: employeeAPI.delete,
    onSuccess: () => { qc.invalidateQueries(['employees']); toast.success('Employee deactivated') },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => employeeAPI.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries(['employees'])
      setEditEmp(null)
      toast.success('Employee updated successfully')
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Failed to update employee'),
  })

  const [confirmToggle, setConfirmToggle] = useState(null)
  const [showImport, setShowImport] = useState(false)
  const [importData, setImportData] = useState([])
  const [importErrors, setImportErrors] = useState([])
  const [importing, setImporting] = useState(false)
  const [importDone, setImportDone] = useState(null)
  const fileInputRef = useRef(null)

  const handleExcelFile = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'binary' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })
        // Normalize headers
        const normalized = rows.map((row, i) => {
          const r = {}
          Object.keys(row).forEach(k => { r[k.trim().toLowerCase().replace(/\s+/g, '_')] = String(row[k]).trim() })
          return r
        }).filter(r => r.full_name || r.name || r.employee_name)
        setImportData(normalized)
        setImportErrors([])
        setImportDone(null)
      } catch { toast.error('Failed to read Excel file') }
    }
    reader.readAsBinaryString(file)
  }

  const downloadTemplate = () => {
    const headers = [
      ['employee_code','full_name','email','phone','designation','department','shift','joining_date','password','pan_number','bank_account','bank_name','ifsc_code']
    ]
    const examples = [
      ['EMP003','John Smith','john@company.com','9876543210','Software Engineer','Engineering','General','2024-01-15','password123','ABCDE1234F','1234567890','HDFC Bank','HDFC0001234'],
      ['EMP004','Jane Doe','jane@company.com','9876543211','HR Manager','HR','General','2024-02-01','password123','','','',''],
    ]
    const ws = XLSX.utils.aoa_to_sheet([...headers, ...examples])
    ws['!cols'] = headers[0].map(() => ({ wch: 20 }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Employees')
    XLSX.writeFile(wb, 'AttendPro_Employee_Import_Template.xlsx')
  }

  const runImport = async () => {
    setImporting(true)
    let success = 0, failed = [], skipped = 0
    for (const row of importData) {
      const name = row.full_name || row.name || row.employee_name || ''
      const email = row.email || row.email_id || ''
      const code = row.employee_code || row.code || row.emp_code || `EMP${Date.now().toString().slice(-4)}`
      const password = row.password || 'Welcome@123'
      if (!name || !email) { failed.push({ name: name || 'Unknown', reason: 'Missing name or email' }); continue }
      // Map department name to id
      const dept = depts.find(d => d.name.toLowerCase() === (row.department || '').toLowerCase())
      const shift = shifts.find(s => s.name.toLowerCase() === (row.shift || '').toLowerCase())
      try {
        await employeeAPI.create({
          employee_code: code,
          full_name: name,
          email,
          phone: row.phone || row.mobile || '',
          designation: row.designation || row.position || '',
          department_id: dept?.id || null,
          shift_id: shift?.id || null,
          joining_date: row.joining_date || row.date_of_joining || null,
          password,
          pan_number: row.pan_number || row.pan || '',
          bank_account: row.bank_account || row.account_number || '',
          bank_name: row.bank_name || '',
          ifsc_code: row.ifsc_code || row.ifsc || '',
        })
        success++
      } catch (e) {
        const msg = e.response?.data?.detail || 'Failed'
        if (msg.includes('already')) { skipped++; continue }
        failed.push({ name, reason: msg })
      }
    }
    setImporting(false)
    setImportDone({ success, failed, skipped })
    if (success > 0) qc.invalidateQueries(['employees'])
  } // {emp, action}

  const toggleEmployee = async () => {
    const { emp } = confirmToggle
    setConfirmToggle(null)
    try {
      if (emp.is_active) {
        await employeeAPI.delete(emp.id)
      } else {
        await employeeAPI.update(emp.id, { is_active: true })
      }
      qc.invalidateQueries(['employees'])
      toast.success(`${emp.full_name} ${emp.is_active ? 'deactivated' : 'activated'}`)
    } catch { toast.error('Failed to update employee status') }
  }

  const openEditModal = (emp) => {
    setEditEmp(emp)
    setEditForm({
      full_name: emp.full_name || '',
      phone: emp.phone || '',
      designation: emp.designation || '',
      department_id: emp.department_id || '',
      shift_id: emp.shift_id || '',
      pan_number: emp.pan_number || '',
      bank_account: emp.bank_account || '',
      bank_name: emp.bank_name || '',
      ifsc_code: emp.ifsc_code || '',
    })
  }

  const toggleExempt = async (emp) => {
    try {
      await employeeAPI.toggleExemptEarlyLeave(emp.id, !emp.exempt_early_leave)
      qc.invalidateQueries(['employees'])
      toast.success(emp.exempt_early_leave ? 'Early leave tracking enabled' : 'Employee exempted from early leave')
    } catch { toast.error('Failed to update') }
  }

  const startFaceReg = async (empId) => {
    setFaceEmpId(empId)
    setFaceShots([])
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true })
      streamRef.current = stream
      setTimeout(() => { if (videoRef.current) videoRef.current.srcObject = stream }, 100)
    } catch { toast.error('Cannot access camera'); setFaceEmpId(null) }
  }

  const captureFace = async () => {
    if (!videoRef.current) return
    const canvas = document.createElement('canvas')
    canvas.width = videoRef.current.videoWidth
    canvas.height = videoRef.current.videoHeight
    canvas.getContext('2d').drawImage(videoRef.current, 0, 0)
    const image = canvas.toDataURL('image/jpeg', 0.85)
    const newShots = [...faceShots, image]
    setFaceShots(newShots)

    if (newShots.length < TOTAL_FACE_SHOTS) {
      toast.success(`Shot ${newShots.length} of ${TOTAL_FACE_SHOTS} captured — shift position slightly for the next one`)
      return
    }

    try {
      const res = await employeeAPI.registerFace(faceEmpId, newShots)
      if (res.data?.success === false) {
        toast.error(res.data.message || 'Face registration failed')
      } else {
        toast.success(res.data?.message || 'Face registered successfully!')
        qc.invalidateQueries(['employees'])
      }
    } catch { toast.error('Face registration failed') }
    streamRef.current?.getTracks().forEach(t => t.stop())
    setFaceEmpId(null)
    setFaceShots([])
  }

  const cancelFace = () => { streamRef.current?.getTracks().forEach(t => t.stop()); setFaceEmpId(null); setFaceShots([]) }

  const openOfficeModal = async (emp) => {
    setOfficeEmpId(emp.id)
    try {
      const res = await settingsAPI.getEmployeeOffice(emp.id)
      setOfficeForm({ office_id: res.data.office_id || '', kiosk_access: res.data.kiosk_access || false })
    } catch { setOfficeForm({ office_id: '', kiosk_access: false }) }
  }

  const saveOfficeAssignment = async () => {
    try {
      await settingsAPI.updateEmployeeOffice(officeEmpId, {
        office_id: officeForm.office_id ? parseInt(officeForm.office_id) : null,
        kiosk_access: officeForm.kiosk_access
      })
      toast.success('Office assignment saved!')
      setOfficeEmpId(null)
    } catch { toast.error('Failed to save') }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    createMutation.mutate({
      ...form,
      department_id: form.department_id ? parseInt(form.department_id) : null,
      shift_id: form.shift_id ? parseInt(form.shift_id) : null,
      joining_date: form.joining_date || null,
      phone: form.phone || null,
    })
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Employees</h1>
          <p className="text-sm text-gray-500">{employees.length} total employees</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowImport(true)} className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors flex items-center gap-2">
            📥 Import Excel
          </button>
          <button onClick={() => setShowForm(true)} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
            + Add Employee
          </button>
        </div>
      </div>

      {/* Face registration modal */}
      {faceEmpId && (
        <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 shadow-xl" style={{width: '520px', maxWidth: '95vw'}}>
            <h3 className="font-semibold text-gray-900 mb-1">Register Face</h3>
            <p className="text-xs text-gray-500 mb-3">
              We'll take {TOTAL_FACE_SHOTS} photos for a more reliable match — shift your position or lighting slightly between shots. Shot {Math.min(faceShots.length + 1, TOTAL_FACE_SHOTS)} of {TOTAL_FACE_SHOTS}.
            </p>
            <video ref={videoRef} autoPlay playsInline muted className="w-full rounded-lg bg-gray-900 aspect-video mb-3 object-cover" />
            {faceShots.length > 0 && (
              <div className="flex gap-2 mb-3">
                {faceShots.map((shot, i) => (
                  <img key={i} src={shot} alt={`Shot ${i + 1}`} className="w-14 h-14 rounded-lg object-cover border border-gray-200" />
                ))}
                {Array.from({ length: TOTAL_FACE_SHOTS - faceShots.length }).map((_, i) => (
                  <div key={`empty-${i}`} className="w-14 h-14 rounded-lg border-2 border-dashed border-gray-200" />
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={captureFace} className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700">
                {faceShots.length + 1 < TOTAL_FACE_SHOTS ? `Capture Shot ${faceShots.length + 1}` : 'Capture Final Shot & Register'}
              </button>
              <button onClick={cancelFace} className="px-4 text-gray-600 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Office assignment modal */}
      {officeEmpId && (
        <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-[420px] shadow-xl">
            <h3 className="font-semibold text-gray-900 mb-1">Office & Kiosk Access</h3>
            <p className="text-xs text-gray-500 mb-4">Assign office location and set kiosk access permission for this employee.</p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Assigned Office</label>
                <select value={officeForm.office_id} onChange={e => setOfficeForm(p => ({ ...p, office_id: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">No office assigned</option>
                  {offices.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
                <p className="text-xs text-gray-400 mt-1">Employee's geofencing will use this office's GPS coordinates</p>
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100">
                <div>
                  <p className="text-sm font-medium text-gray-900">Personal Kiosk Access</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {officeForm.kiosk_access
                      ? '✓ Can use personal device at /my-kiosk link'
                      : '✗ Must use office gate kiosk device'}
                  </p>
                </div>
                <button onClick={() => setOfficeForm(p => ({ ...p, kiosk_access: !p.kiosk_access }))}
                  className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${officeForm.kiosk_access ? 'bg-blue-600' : 'bg-gray-300'}`}>
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${officeForm.kiosk_access ? 'left-7' : 'left-1'}`} />
                </button>
              </div>

              {officeForm.kiosk_access && (
                <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700 space-y-1">
                  <p className="font-medium">Personal kiosk link:</p>
                  <p className="font-mono bg-white border border-blue-200 rounded px-2 py-1">
                    {window.location.origin}/my-kiosk
                  </p>
                  <p>Employee must log in and be within {offices.find(o => o.id == officeForm.office_id)?.radius_meters || 50}m of {offices.find(o => o.id == officeForm.office_id)?.name || 'assigned office'}</p>
                </div>
              )}

              {!officeForm.kiosk_access && (
                <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg text-xs text-amber-700">
                  ⚠️ Kiosk access is OFF. If this employee opens /my-kiosk, they will see "Access Denied" and must use the physical office kiosk.
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-5">
              <button onClick={saveOfficeAssignment} className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700">Save</button>
              <button onClick={() => setOfficeEmpId(null)} className="px-4 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Add employee form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 mb-6">
          <h2 className="text-sm font-medium text-gray-700 mb-4">New Employee</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Employee Code *</label>
              <input type="text" required placeholder="EMP001" value={form.employee_code}
                onChange={e => setForm(f => ({ ...f, employee_code: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Full Name *</label>
              <input type="text" required placeholder="John Doe" value={form.full_name}
                onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Email *</label>
              <input type="email" required placeholder="john@company.com" value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Phone</label>
              <input type="text" placeholder="9876543210" value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Designation</label>
              <input type="text" placeholder="Software Engineer" value={form.designation}
                onChange={e => setForm(f => ({ ...f, designation: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Joining Date</label>
              <input type="date" value={form.joining_date}
                onChange={e => setForm(f => ({ ...f, joining_date: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Department</label>
              <select value={form.department_id} onChange={e => setForm(f => ({ ...f, department_id: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Select department</option>
                {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Shift</label>
              <select value={form.shift_id} onChange={e => setForm(f => ({ ...f, shift_id: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Select shift</option>
                {shifts.map(s => <option key={s.id} value={s.id}>{s.name} ({s.start_time} – {s.end_time})</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Password *</label>
              <input type="password" required placeholder="Login password for employee" value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            {/* Payroll Information */}
            <div className="col-span-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-1 mb-2">Payroll Information</p>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">PAN Number</label>
              <input type="text" placeholder="ABCDE1234F" value={form.pan_number}
                onChange={e => setForm(f => ({ ...f, pan_number: e.target.value.toUpperCase() }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Bank Account Number</label>
              <input type="text" placeholder="XXXX-XXXX-1234" value={form.bank_account}
                onChange={e => setForm(f => ({ ...f, bank_account: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Bank Name</label>
              <input type="text" placeholder="HDFC Bank" value={form.bank_name}
                onChange={e => setForm(f => ({ ...f, bank_name: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">IFSC Code</label>
              <input type="text" placeholder="HDFC0001234" value={form.ifsc_code}
                onChange={e => setForm(f => ({ ...f, ifsc_code: e.target.value.toUpperCase() }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="col-span-2 flex gap-2 pt-2">
              <button type="submit" disabled={createMutation.isPending}
                className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {createMutation.isPending ? 'Saving...' : 'Save Employee'}
              </button>
              <button type="button" onClick={() => setShowForm(false)}
                className="px-5 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Employees table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {['Code', 'Name', 'Designation', 'Department', 'Shift', 'Face', 'Early Leave', 'Status', 'Actions'].map(h => (
                <th key={h} className="text-left text-xs font-medium text-gray-500 px-4 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {employees.map(emp => (
              <tr key={emp.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs text-gray-500">{emp.employee_code}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-medium flex-shrink-0">
                      {emp.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{emp.full_name}</p>
                      <p className="text-xs text-gray-400">{emp.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-600">{emp.designation || '—'}</td>
                <td className="px-4 py-3 text-gray-600">{emp.department?.name || '—'}</td>
                <td className="px-4 py-3 text-gray-600">{emp.shift?.name || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${emp.face_registered ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-500'}`}>
                    {emp.face_registered ? 'Registered' : 'Not set'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => toggleExempt(emp)}
                    title={emp.exempt_early_leave ? "Exempt: Early leave not tracked" : "Early leave is tracked"}
                    className={`relative w-10 h-5 rounded-full transition-colors ${emp.exempt_early_leave ? 'bg-gray-300' : 'bg-blue-500'}`}>
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${emp.exempt_early_leave ? 'left-5' : 'left-0.5'}`} />
                  </button>
                  <p className="text-xs text-gray-400 mt-0.5">{emp.exempt_early_leave ? 'Exempt' : 'Tracked'}</p>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${emp.is_active ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-500'}`}>
                    {emp.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2 flex-wrap">
                    <button onClick={() => openEditModal(emp)} className="text-xs text-green-600 hover:underline whitespace-nowrap">
                      Edit
                    </button>
                    <span className="text-gray-200">|</span>
                    <button onClick={() => startFaceReg(emp.id)} className="text-xs text-blue-600 hover:underline whitespace-nowrap">
                      {emp.face_registered ? 'Re-register' : 'Register face'}
                    </button>
                    <span className="text-gray-200">|</span>
                    <button onClick={() => openOfficeModal(emp)} className="text-xs text-purple-600 hover:underline whitespace-nowrap">
                      Office & Kiosk
                    </button>
                    <span className="text-gray-200">|</span>
                    <button onClick={() => setConfirmToggle({ emp })}
                      className={`text-xs hover:underline ${emp.is_active ? 'text-red-400' : 'text-green-600'}`}>
                      {emp.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {employees.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-gray-400 text-sm">
                  No employees yet. Click <strong>+ Add Employee</strong> to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Activate/Deactivate Confirm Modal */}
      {confirmToggle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setConfirmToggle(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 z-10">
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl ${confirmToggle.emp.is_active ? 'bg-red-100' : 'bg-green-100'}`}>
                {confirmToggle.emp.is_active ? '🔴' : '🟢'}
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  {confirmToggle.emp.is_active ? 'Deactivate' : 'Activate'} Employee
                </h3>
                <p className="text-sm text-gray-500">{confirmToggle.emp.full_name}</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-5">
              {confirmToggle.emp.is_active
                ? `Are you sure you want to deactivate ${confirmToggle.emp.full_name}? They will no longer be able to log in or mark attendance.`
                : `Are you sure you want to activate ${confirmToggle.emp.full_name}? They will regain access to the system.`
              }
            </p>
            <div className="flex gap-3">
              <button onClick={toggleEmployee}
                className={`flex-1 text-white py-2.5 rounded-lg font-medium transition-colors ${confirmToggle.emp.is_active ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}>
                {confirmToggle.emp.is_active ? '🔴 Yes, Deactivate' : '🟢 Yes, Activate'}
              </button>
              <button onClick={() => setConfirmToggle(null)}
                className="px-5 py-2.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Employee Modal */}
      {editEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40" onClick={() => setEditEmp(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 z-10 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-gray-800">Edit Employee — {editEmp.full_name}</h2>
              <button onClick={() => setEditEmp(null)} className="text-gray-400 hover:text-gray-600 text-2xl">×</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs text-gray-500 mb-1">Full Name</label>
                <input value={editForm.full_name} onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Phone</label>
                <input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Designation</label>
                <input value={editForm.designation} onChange={e => setEditForm(f => ({ ...f, designation: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Department</label>
                <select value={editForm.department_id} onChange={e => setEditForm(f => ({ ...f, department_id: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">No Department</option>
                  {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Shift</label>
                <select value={editForm.shift_id} onChange={e => setEditForm(f => ({ ...f, shift_id: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">No Shift</option>
                  {shifts.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              {/* Payroll Info */}
              <div className="col-span-2 pt-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Payroll Information</p>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">PAN Number</label>
                <input value={editForm.pan_number} onChange={e => setEditForm(f => ({ ...f, pan_number: e.target.value.toUpperCase() }))}
                  placeholder="ABCDE1234F"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Bank Account</label>
                <input value={editForm.bank_account} onChange={e => setEditForm(f => ({ ...f, bank_account: e.target.value }))}
                  placeholder="XXXX-XXXX-1234"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Bank Name</label>
                <input value={editForm.bank_name} onChange={e => setEditForm(f => ({ ...f, bank_name: e.target.value }))}
                  placeholder="HDFC Bank"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">IFSC Code</label>
                <input value={editForm.ifsc_code} onChange={e => setEditForm(f => ({ ...f, ifsc_code: e.target.value.toUpperCase() }))}
                  placeholder="HDFC0001234"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="col-span-2 flex gap-3 pt-2">
                <button
                  onClick={() => updateMutation.mutate({ id: editEmp.id, data: editForm })}
                  disabled={updateMutation.isPending}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                  {updateMutation.isPending ? 'Saving…' : 'Save Changes'}
                </button>
                <button onClick={() => setEditEmp(null)}
                  className="px-5 py-2.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 text-sm transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Import Excel Modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => { setShowImport(false); setImportData([]); setImportDone(null); setImportErrors([]) }} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl z-10 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-5">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">📥 Import Employees from Excel</h2>
                  <p className="text-sm text-gray-500 mt-1">Upload an Excel file to bulk-register employees</p>
                </div>
                <button onClick={() => { setShowImport(false); setImportData([]); setImportDone(null) }} className="text-gray-400 hover:text-gray-600 text-2xl">×</button>
              </div>

              {/* Step 1 - Download Template */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
                <p className="text-sm font-semibold text-blue-800 mb-2">Step 1 — Download the template</p>
                <p className="text-xs text-blue-600 mb-3">Fill in the template with employee details. Required columns: <strong>employee_code, full_name, email, password</strong>. All others are optional.</p>
                <button onClick={downloadTemplate} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                  ⬇ Download Excel Template
                </button>
              </div>

              {/* Column Guide */}
              <div className="bg-gray-50 rounded-xl p-4 mb-4 text-xs">
                <p className="font-semibold text-gray-700 mb-2">Column Reference</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-gray-600">
                  {[
                    ['employee_code','Unique code (e.g. EMP003)'],
                    ['full_name','Employee full name *'],
                    ['email','Login email *'],
                    ['phone','Mobile number'],
                    ['designation','Job title'],
                    ['department','Must match dept name in Settings'],
                    ['shift','Must match shift name in Settings'],
                    ['joining_date','Format: YYYY-MM-DD'],
                    ['password','Default: Welcome@123'],
                    ['pan_number','PAN card number'],
                    ['bank_account','Bank account number'],
                    ['bank_name','Bank name'],
                    ['ifsc_code','IFSC code'],
                  ].map(([col, desc]) => (
                    <div key={col} className="flex gap-2">
                      <span className="font-mono text-blue-600 shrink-0">{col}</span>
                      <span className="text-gray-500">{desc}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Step 2 - Upload */}
              <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl p-6 mb-4 text-center">
                <p className="text-sm font-semibold text-gray-700 mb-2">Step 2 — Upload your filled Excel file</p>
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleExcelFile} className="hidden" />
                <button onClick={() => fileInputRef.current.click()} className="bg-white border border-gray-300 hover:border-blue-400 text-gray-700 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors">
                  📂 Choose Excel File
                </button>
                {importData.length > 0 && (
                  <p className="mt-3 text-sm text-green-700 font-medium">✓ {importData.length} employee(s) ready to import</p>
                )}
              </div>

              {/* Preview Table */}
              {importData.length > 0 && !importDone && (
                <div className="mb-4 overflow-x-auto">
                  <p className="text-sm font-semibold text-gray-700 mb-2">Preview ({importData.length} rows)</p>
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-gray-100">
                        {['#','Code','Name','Email','Designation','Department','Password'].map(h => (
                          <th key={h} className="px-3 py-2 text-left text-gray-600 font-semibold border border-gray-200">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {importData.slice(0, 8).map((row, i) => (
                        <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="px-3 py-2 border border-gray-200 text-gray-400">{i+1}</td>
                          <td className="px-3 py-2 border border-gray-200">{row.employee_code || row.code || 'Auto'}</td>
                          <td className="px-3 py-2 border border-gray-200 font-medium">{row.full_name || row.name}</td>
                          <td className="px-3 py-2 border border-gray-200 text-blue-600">{row.email}</td>
                          <td className="px-3 py-2 border border-gray-200">{row.designation || '—'}</td>
                          <td className="px-3 py-2 border border-gray-200">{row.department || '—'}</td>
                          <td className="px-3 py-2 border border-gray-200 text-gray-400">{'•'.repeat(8)}</td>
                        </tr>
                      ))}
                      {importData.length > 8 && (
                        <tr><td colSpan={7} className="px-3 py-2 text-center text-gray-400 text-xs">...and {importData.length - 8} more rows</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Import Result */}
              {importDone && (
                <div className="mb-4 space-y-2">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">
                    ✅ {importDone.success} employee(s) imported successfully
                    {importDone.skipped > 0 && ` · ${importDone.skipped} skipped (already exist)`}
                  </div>
                  {importDone.failed.length > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                      <p className="text-sm font-semibold text-red-700 mb-1">❌ {importDone.failed.length} failed:</p>
                      {importDone.failed.map((f, i) => (
                        <p key={i} className="text-xs text-red-600">{f.name}: {f.reason}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                {importData.length > 0 && !importDone && (
                  <button onClick={runImport} disabled={importing}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50">
                    {importing ? `Importing... (${importData.length} employees)` : `✅ Import ${importData.length} Employee(s)`}
                  </button>
                )}
                {importDone && (
                  <button onClick={() => { setShowImport(false); setImportData([]); setImportDone(null) }}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg font-medium transition-colors">
                    Done
                  </button>
                )}
                <button onClick={() => { setShowImport(false); setImportData([]); setImportDone(null) }}
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
