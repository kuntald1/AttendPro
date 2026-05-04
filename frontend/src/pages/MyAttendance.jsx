import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { reportsAPI } from '../api'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

const STATUS_COLORS = {
  present: 'bg-green-100 text-green-700 border-green-200',
  late: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  absent: 'bg-red-100 text-red-700 border-red-200',
  on_leave: 'bg-blue-100 text-blue-700 border-blue-200',
  holiday: 'bg-purple-100 text-purple-700 border-purple-200',
  weekend: 'bg-gray-50 text-gray-400 border-gray-100',
  future: 'bg-white text-gray-300 border-gray-100',
}

const STATUS_LABELS = {
  present: 'P', late: 'L', absent: 'A', on_leave: 'Leave',
  holiday: 'H', weekend: '', future: ''
}

export default function MyAttendance() {
  const currentYear = new Date().getFullYear()
  const currentMonth = new Date().getMonth() + 1
  const [year, setYear] = useState(currentYear)
  const [month, setMonth] = useState(currentMonth)

  const { data, isLoading } = useQuery({
    queryKey: ['my-attendance', year, month],
    queryFn: () => reportsAPI.myAttendance(year, month).then(r => r.data),
  })

  if (isLoading) return <div className="p-6 text-sm text-gray-400">Loading...</div>
  
  if (data?.is_admin) return (
    <div className="p-6 max-w-lg">
      <h1 className="text-xl font-semibold text-gray-900 mb-2">My Attendance</h1>
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-6 text-center">
        <p className="text-4xl mb-3">👨‍💼</p>
        <p className="text-blue-800 font-medium mb-1">Admin Account</p>
        <p className="text-blue-600 text-sm">{data.message}</p>
        <a href="/reports" className="inline-block mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
          Go to Reports →
        </a>
      </div>
    </div>
  )

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">My Attendance</h1>
          <p className="text-sm text-gray-500">{data?.employee?.name} · {data?.employee?.code}</p>
        </div>
        <div className="flex gap-2">
          <select value={month} onChange={e => setMonth(parseInt(e.target.value))}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            {MONTHS.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
          </select>
          <select value={year} onChange={e => setYear(parseInt(e.target.value))}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            {[currentYear-1, currentYear].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Present', value: data?.summary?.present, color: 'green' },
          { label: 'Late', value: data?.summary?.late, color: 'yellow' },
          { label: 'On Leave', value: data?.summary?.on_leave, color: 'blue' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-100 p-4 text-center">
            <p className="text-xs text-gray-500 mb-1">{s.label}</p>
            <p className={`text-3xl font-bold text-${s.color}-600`}>{s.value || 0}</p>
          </div>
        ))}
      </div>

      {/* Leave balance */}
      {data?.leave_balance?.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-4 mb-6">
          <p className="text-sm font-medium text-gray-900 mb-3">Leave Balance {year}</p>
          <div className="grid grid-cols-3 gap-3">
            {data.leave_balance.map(lb => (
              <div key={lb.type} className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">{lb.type}</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-bold text-blue-600">{lb.remaining}</span>
                  <span className="text-xs text-gray-400">/ {lb.allocated} days left</span>
                </div>
                <div className="mt-2 bg-gray-200 rounded-full h-1.5">
                  <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${(lb.remaining / lb.allocated) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Calendar */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <p className="text-sm font-medium text-gray-900 mb-4">{MONTHS[month-1]} {year}</p>

        {/* Legend */}
        <div className="flex gap-3 mb-4 flex-wrap">
          {[
            { label: 'Present', cls: 'bg-green-100 text-green-700' },
            { label: 'Late', cls: 'bg-yellow-100 text-yellow-700' },
            { label: 'Absent', cls: 'bg-red-100 text-red-700' },
            { label: 'Leave', cls: 'bg-blue-100 text-blue-700' },
            { label: 'Holiday', cls: 'bg-purple-100 text-purple-700' },
          ].map(l => (
            <span key={l.label} className={`text-xs px-2 py-0.5 rounded-full ${l.cls}`}>{l.label}</span>
          ))}
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
            <div key={d} className="text-center text-xs text-gray-400 font-medium py-1">{d}</div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-1">
          {/* Empty cells for first week offset */}
          {Array.from({ length: data?.calendar?.[0] ? new Date(data.calendar[0].date).getDay() === 0 ? 6 : new Date(data.calendar[0].date).getDay() - 1 : 0 }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}
          {data?.calendar?.map(day => (
            <div key={day.date}
              className={`border rounded-lg p-1 min-h-[60px] flex flex-col items-center ${STATUS_COLORS[day.status] || 'bg-white border-gray-100'}`}>
              <span className="text-xs font-medium">{day.day}</span>
              <span className="text-xs mt-0.5">{day.weekday}</span>
              {day.holiday_name && <span className="text-xs mt-0.5 text-center leading-tight">{day.holiday_name}</span>}
              {STATUS_LABELS[day.status] && !day.holiday_name && (
                <span className="text-xs font-bold mt-1">{STATUS_LABELS[day.status]}</span>
              )}
              {day.check_in && (
                <span className="text-xs mt-0.5 opacity-70">{day.check_in}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
