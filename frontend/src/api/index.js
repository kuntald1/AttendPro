import axios from 'axios'

const api = axios.create({
  baseURL: '',
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.clear()
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export const authAPI = {
  login: (data) => api.post('/api/auth/login', data),
  me: () => api.get('/api/auth/me'),
}

export const employeeAPI = {
  list: () => api.get('/api/employees/'),
  get: (id) => api.get(`/api/employees/${id}`),
  create: (data) => api.post('/api/employees/', data),
  update: (id, data) => api.patch(`/api/employees/${id}`, data),
  delete: (id) => api.delete(`/api/employees/${id}`),
  registerFace: (id, image) => api.post(`/api/attendance/face/register/${id}`, { image }),
  toggleExemptEarlyLeave: (id, exempt) => api.patch(`/api/employees/${id}/exempt-early-leave`, { exempt }),
}

export const attendanceAPI = {
  recognize: (image) => api.post('/api/attendance/face/recognize', { image }),
  recognizePersonal: (image, lat, lng) => api.post('/api/attendance/face/recognize-personal', { image, lat, lng }),
  today: () => api.get('/api/attendance/today'),
  logs: (params) => api.get('/api/attendance/logs', { params }),
  manual: (data) => api.post('/api/attendance/manual', data),
  dashboard: () => api.get('/api/attendance/dashboard'),
  checkKioskDevice: () => api.get('/api/attendance/kiosk/check'),
}

export const leaveAPI = {
  types: () => api.get('/api/leave/types'),
  apply: (data) => api.post('/api/leave/apply', data),
  list: () => api.get('/api/leave/'),
  review: (id, data) => api.patch(`/api/leave/${id}/review`, data),
  createType: (data) => api.post('/api/leave/types', data),
  updateType: (id, data) => api.patch(`/api/leave/types/${id}`, data),
  deleteType: (id) => api.delete(`/api/leave/types/${id}`),
}

export const departmentAPI = {
  list: () => api.get('/api/departments/'),
  create: (data) => api.post('/api/departments/', data),
  delete: (id) => api.delete(`/api/departments/${id}`),
}

export const shiftAPI = {
  list: () => api.get('/api/shifts/'),
  create: (data) => api.post('/api/shifts/', data),
  delete: (id) => api.delete(`/api/shifts/${id}`),
}

export const settingsAPI = {
  get: () => api.get('/api/settings/'),
  update: (data) => api.patch('/api/settings/', data),
  getTimezones: () => api.get('/api/settings/timezones'),
  getGeofencing: () => api.get('/api/settings/geofencing'),
  updateGeofencing: (data) => api.patch('/api/settings/geofencing', data),
  getOffices: () => api.get('/api/settings/offices'),
  createOffice: (data) => api.post('/api/settings/offices', data),
  updateOffice: (id, data) => api.patch(`/api/settings/offices/${id}`, data),
  deleteOffice: (id) => api.delete(`/api/settings/offices/${id}`),
  getMyIp: () => api.get('/api/settings/my-ip'),
  getKioskDevices: () => api.get('/api/settings/kiosk-devices'),
  addKioskDevice: (data) => api.post('/api/settings/kiosk-devices', data),
  removeKioskDevice: (id) => api.delete(`/api/settings/kiosk-devices/${id}`),
  getEmployeeOffice: (empId) => api.get(`/api/settings/employee-office/${empId}`),
  updateEmployeeOffice: (empId, data) => api.patch(`/api/settings/employee-office/${empId}`, data),
  getHolidays: (year) => api.get('/api/settings/holidays', { params: { year } }),
  addHoliday: (data) => api.post('/api/settings/holidays', data),
  deleteHoliday: (id) => api.delete(`/api/settings/holidays/${id}`),
}

export const manualAttendanceAPI = {
  list: (date, employee_id) => api.get('/api/attendance/manual-list', { params: { date, employee_id } }),
  save: (data) => api.post('/api/attendance/manual-save', data),
}

export default api

export const reportsAPI = {
  monthlySummary: (params) => api.get('/api/reports/monthly-summary', { params }),
  lateReport: (params) => api.get('/api/reports/late-report', { params }),
  absentReport: (from_date, to_date, filters = {}) => api.get('/api/reports/absent-report', { params: { from_date, to_date, ...filters } }),
  exportExcel: (year, month) => api.get('/api/reports/export/excel', { params: { year, month }, responseType: 'blob' }),
  myAttendance: (year, month) => api.get('/api/reports/my-attendance', { params: { year, month } }),
  scanLogs: (date, employee_id) => api.get('/api/attendance/scan-logs', { params: { date, employee_id } }),
}
