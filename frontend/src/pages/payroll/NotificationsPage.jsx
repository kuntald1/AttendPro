import React, { useState } from "react";
import axios from "axios";

const API = process.env.REACT_APP_API_URL || "";

export default function NotificationsPage() {
  const [loading, setLoading] = useState({});
  const [results, setResults] = useState({});
  const [testEmail, setTestEmail] = useState("");

  const authHeader = () => {
    const token = localStorage.getItem("token");
    return { headers: { Authorization: `Bearer ${token}` } };
  };

  const run = async (key, fn) => {
    setLoading(l => ({ ...l, [key]: true }));
    setResults(r => ({ ...r, [key]: null }));
    try {
      const res = await fn();
      setResults(r => ({ ...r, [key]: { success: true, data: res.data } }));
    } catch (e) {
      setResults(r => ({ ...r, [key]: { success: false, error: e.response?.data?.detail || e.message } }));
    } finally {
      setLoading(l => ({ ...l, [key]: false }));
    }
  };

  const actions = [
    {
      key: "test",
      icon: "📧",
      title: "Send Test Email",
      description: "Verify your SMTP configuration is working correctly.",
      color: "blue",
      action: () => run("test", () =>
        axios.post(`${API}/api/payroll/notifications/test`, { to_email: testEmail }, authHeader())
      ),
      extra: (
        <input type="email" placeholder="Send test to…" value={testEmail}
          onChange={e => setTestEmail(e.target.value)}
          className="mt-2 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
      ),
    },
    {
      key: "absent",
      icon: "🚨",
      title: "Send Absent Alerts",
      description: "Email all employees who are absent today (no clock-in recorded).",
      color: "red",
      action: () => run("absent", () =>
        axios.post(`${API}/api/payroll/notifications/absent-alerts`, {}, authHeader())
      ),
    },
    {
      key: "summary",
      icon: "📊",
      title: "Send Daily Summary",
      description: "Send today's attendance summary report to the admin email.",
      color: "green",
      action: () => run("summary", () =>
        axios.post(`${API}/api/payroll/notifications/daily-summary`, {}, authHeader())
      ),
    },
  ];

  const colorMap = {
    blue:  { btn: "bg-blue-700 hover:bg-blue-800",  border: "border-blue-200",  bg: "bg-blue-50"  },
    red:   { btn: "bg-red-600 hover:bg-red-700",    border: "border-red-200",   bg: "bg-red-50"   },
    green: { btn: "bg-green-700 hover:bg-green-800",border: "border-green-200", bg: "bg-green-50" },
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Email Notifications</h1>
        <p className="text-gray-500 text-sm mt-0.5">Manage automated email alerts and summaries</p>
      </div>

      {/* SMTP Config Info */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-sm text-amber-800">
        <strong>⚙️ SMTP Configuration</strong> — Configure email credentials in your <code className="bg-amber-100 px-1 rounded">.env</code> file:<br/>
        <code className="block mt-2 bg-amber-100 px-3 py-2 rounded text-xs leading-6">
          SMTP_HOST=smtp.gmail.com<br/>
          SMTP_PORT=587<br/>
          SMTP_USER=your@gmail.com<br/>
          SMTP_PASSWORD=your_app_password<br/>
          FROM_EMAIL=your@gmail.com<br/>
          FROM_NAME=AttendPro System<br/>
          ADMIN_EMAIL=admin@company.com<br/>
          COMPANY_NAME=Your Company Pvt. Ltd.
        </code>
        <p className="mt-2 text-xs text-amber-700">For Gmail, use an App Password (not your account password). Enable 2FA first.</p>
      </div>

      {/* Action Cards */}
      <div className="space-y-4">
        {actions.map(a => {
          const c = colorMap[a.color];
          const result = results[a.key];
          return (
            <div key={a.key} className={`bg-white border ${result?.success ? "border-green-200" : result?.success === false ? "border-red-200" : "border-gray-100"} rounded-xl shadow-sm p-5`}>
              <div className="flex justify-between items-start gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xl">{a.icon}</span>
                    <h3 className="font-semibold text-gray-800">{a.title}</h3>
                  </div>
                  <p className="text-sm text-gray-500">{a.description}</p>
                  {a.extra}
                </div>
                <button
                  onClick={a.action}
                  disabled={loading[a.key]}
                  className={`${c.btn} text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 whitespace-nowrap flex-shrink-0`}
                >
                  {loading[a.key] ? "Sending…" : "Send Now"}
                </button>
              </div>
              {result && (
                <div className={`mt-3 rounded-lg px-4 py-3 text-sm ${result.success ? "bg-green-50 text-green-800 border border-green-100" : "bg-red-50 text-red-700 border border-red-100"}`}>
                  {result.success ? (
                    <span>✓ {result.data?.message || JSON.stringify(result.data)}</span>
                  ) : (
                    <span>✗ {result.error}</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Scheduler Info */}
      <div className="mt-8 bg-white border border-gray-100 rounded-xl shadow-sm p-5">
        <h2 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <span>🕐</span> Automated Schedule
        </h2>
        <div className="space-y-3">
          {[
            { time: "10:00 AM",  days: "Mon–Sat", job: "Absent Alerts",      desc: "Email employees without a clock-in", icon: "🚨" },
            { time: "7:00 PM",   days: "Mon–Sat", job: "Daily Summary",      desc: "Attendance report sent to admin",    icon: "📊" },
            { time: "8:00 AM",   days: "1st of month", job: "Monthly Payslips", desc: "Auto-generate payslips for all employees", icon: "💰" },
          ].map(s => (
            <div key={s.job} className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
              <span className="text-xl">{s.icon}</span>
              <div className="flex-1">
                <div className="font-medium text-gray-800 text-sm">{s.job}</div>
                <div className="text-xs text-gray-500">{s.desc}</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold text-blue-700">{s.time}</div>
                <div className="text-xs text-gray-400">{s.days}</div>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-3">
          Jobs run automatically via APScheduler when the backend is running. 
          Restart the backend after changing SMTP credentials.
        </p>
      </div>
    </div>
  );
}
