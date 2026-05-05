import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";

const API = process.env.REACT_APP_API_URL || "";

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

const STATUS_STYLES = {
  draft:     "bg-gray-100 text-gray-600",
  generated: "bg-blue-100 text-blue-700",
  paid:      "bg-green-100 text-green-700",
  DRAFT:     "bg-gray-100 text-gray-600",
  GENERATED: "bg-blue-100 text-blue-700",
  PAID:      "bg-green-100 text-green-700",
};

export default function PayslipsPage() {
  const [payslips, setPayslips]   = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading]     = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError]         = useState("");
  const [success, setSuccess]     = useState("");
  const [showGenModal, setShowGenModal] = useState(false);
  const [selectedPayslip, setSelectedPayslip] = useState(null);
  const [confirmMarkAll, setConfirmMarkAll] = useState(null);
  const [userRole, setUserRole]   = useState("employee"); // track current user role
  const isAdmin = ["admin", "hr", "manager"].includes(userRole);

  const now = new Date();
  const [filters, setFilters] = useState({
    pay_month: now.getMonth() + 1,
    pay_year: now.getFullYear(),
    employee_id: "",
    status: "",
  });

  const [genForm, setGenForm] = useState({
    mode: "single",
    employee_id: "",
    pay_month: now.getMonth() + 1,
    pay_year: now.getFullYear(),
    working_days: "",
    present_days: "",
    paid_leaves: 0,
    remarks: "",
    loadingAttendance: false,
  });

  // Auto-fetch attendance summary when employee, month or year changes
  const fetchAttendanceSummary = async (employee_id, pay_month, pay_year) => {
    if (!employee_id) return;
    setGenForm(f => ({ ...f, loadingAttendance: true }));
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(`${API}/api/payroll/attendance-summary`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { employee_id, pay_month, pay_year }
      });
      setGenForm(f => ({
        ...f,
        working_days: res.data.working_days,
        present_days: res.data.present_days,
        paid_leaves: res.data.paid_leaves,
        loadingAttendance: false,
      }));
    } catch {
      setGenForm(f => ({ ...f, loadingAttendance: false }));
    }
  };

  const authHeader = () => {
    const token = localStorage.getItem("token");
    return { headers: { Authorization: `Bearer ${token}` } };
  };

  const fetchPayslips = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = { pay_month: filters.pay_month, pay_year: filters.pay_year };
      if (filters.employee_id) params.employee_id = filters.employee_id;
      if (filters.status)      params.status = filters.status;
      const res = await axios.get(`${API}/api/payroll/payslips`, { ...authHeader(), params });
      const all = res.data || [];
      // Employees only see PAID payslips
      setPayslips(isAdmin ? all : all.filter(p => p.status?.toUpperCase() === "PAID"));
    } catch {
      setError("Failed to load payslips");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    // Get current user role
    axios.get(`${API}/api/auth/me`, authHeader())
      .then(r => setUserRole(r.data?.role || "employee"))
      .catch(() => {});
    fetchPayslips();
    axios.get(`${API}/api/employees/`, authHeader())
      .then(r => setEmployees((r.data || []).filter(e => e.role !== "admin" && e.is_active !== false)))
      .catch(() => {});
  }, [fetchPayslips]);

  const generate = async () => {
    setGenerating(true);
    setError("");
    try {
      if (genForm.mode === "bulk") {
        await axios.post(`${API}/api/payroll/payslips/bulk-generate`, {
          pay_month: genForm.pay_month,
          pay_year: genForm.pay_year,
        }, authHeader());
        setSuccess(`Bulk payslips generated for ${MONTHS[genForm.pay_month - 1]} ${genForm.pay_year}`);
      } else {
        await axios.post(`${API}/api/payroll/payslips/generate`, {
          employee_id: parseInt(genForm.employee_id),
          pay_month: genForm.pay_month,
          pay_year: genForm.pay_year,
          working_days: parseInt(genForm.working_days),
          present_days: parseInt(genForm.present_days),
          paid_leaves: parseInt(genForm.paid_leaves),
          remarks: genForm.remarks,
        }, authHeader());
        setSuccess("Payslip generated successfully!");
      }
      setShowGenModal(false);
      fetchPayslips();
      setTimeout(() => setSuccess(""), 4000);
    } catch (e) {
      setError(e.response?.data?.detail || "Failed to generate payslip");
    } finally {
      setGenerating(false);
    }
  };

  const downloadPdf = async (payslip) => {
    try {
      const res = await axios.get(
        `${API}/api/payroll/payslips/${payslip.id}/download`,
        { ...authHeader(), responseType: "blob" }
      );
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `payslip_EMP${payslip.employee_id}_${payslip.pay_year}_${String(payslip.pay_month).padStart(2,"0")}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      setError("Failed to download PDF");
    }
  };

  const sendEmail = async (id) => {
    try {
      await axios.post(`${API}/api/payroll/payslips/${id}/send-email`, {}, authHeader());
      setSuccess("Payslip emailed to employee!");
      setTimeout(() => setSuccess(""), 3000);
    } catch {
      setError("Failed to send email");
    }
  };

  const markPaid = async (id) => {
    try {
      await axios.patch(`${API}/api/payroll/payslips/${id}/status`,
        { status: "PAID", payment_date: new Date().toISOString().split("T")[0] },
        authHeader()
      );
      fetchPayslips();
    } catch { setError("Failed to update status"); }
  };

  const markAllPaid = async () => {
    const unpaid = payslips.filter(p => p.status?.toUpperCase() !== "PAID");
    if (!unpaid.length) { setError("No pending payslips to mark as paid."); return; }
    setConfirmMarkAll(unpaid); return;
    setLoading(true);
    let success = 0, failed = 0;
    for (const ps of unpaid) {
      try {
        await axios.patch(`${API}/api/payroll/payslips/${ps.id}/status`,
          { status: "PAID", payment_date: new Date().toISOString().split("T")[0] },
          authHeader()
        );
        success++;
      } catch { failed++; }
    }
    fetchPayslips();
    setLoading(false);
    if (failed) setError(`${success} paid, ${failed} failed.`);
  };

  const deletePayslip = async (id) => {
    if (!window.confirm("Delete this payslip? The PDF will also be removed.")) return;
    try {
      await axios.delete(`${API}/api/payroll/payslips/${id}`, authHeader());
      fetchPayslips();
    } catch { setError("Failed to delete"); }
  };

  const proceedMarkAll = async () => {
    const unpaid = confirmMarkAll;
    setConfirmMarkAll(null);
    setLoading(true);
    let success = 0, failed = 0;
    for (const ps of unpaid) {
      try {
        await axios.patch(`${API}/api/payroll/payslips/${ps.id}/status`,
          { status: "PAID", payment_date: new Date().toISOString().split("T")[0] },
          authHeader()
        );
        success++;
      } catch { failed++; }
    }
    fetchPayslips();
    setLoading(false);
    if (failed) setError(`${success} paid, ${failed} failed.`);
    else setSuccess(`✓ ${success} payslip(s) marked as paid and emailed!`);
  };

  const fmt = (n) => `₹${(n||0).toLocaleString("en-IN",{minimumFractionDigits:2})}`;

  // Summary stats
  const totalNet   = payslips.reduce((a,p) => a + p.net_pay, 0);
  const paidCount  = payslips.filter(p => p.status?.toUpperCase() === "PAID").length;
  const pendCount  = payslips.filter(p => p.status?.toUpperCase() !== "PAID").length;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Payslips</h1>
          <p className="text-gray-500 text-sm mt-0.5">Generate, manage and distribute monthly payslips</p>
        </div>
        <div className="flex gap-2">
          {isAdmin && pendCount > 0 && (
            <button onClick={markAllPaid} disabled={loading}
              className="bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-lg font-medium flex items-center gap-2 transition-colors disabled:opacity-50">
              ✅ Mark All Paid ({pendCount})
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => { setShowGenModal(true); setError(""); }}
              className="bg-blue-700 hover:bg-blue-800 text-white px-5 py-2.5 rounded-lg font-medium flex items-center gap-2 transition-colors"
            >
              ⚡ Generate Payslips
            </button>
          )}
        </div>
      </div>

      {/* Alerts */}
      {success && <div className="mb-4 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg">✓ {success}</div>}
      {error   && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error}</div>}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total Payslips",  value: payslips.length, color: "blue"  },
          { label: "Paid",            value: paidCount,        color: "green" },
          { label: "Pending",         value: pendCount,         color: "yellow"},
          { label: "Total Net Pay",   value: fmt(totalNet),    color: "blue", big: true },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs text-gray-500 mb-1">{s.label}</p>
            <p className={`font-bold ${s.big ? "text-lg" : "text-2xl"} text-${s.color}-700`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-4 flex flex-wrap gap-3">
        <select value={filters.pay_month}
          onChange={e => setFilters(f => ({ ...f, pay_month: parseInt(e.target.value) }))}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
          {MONTHS.map((m,i) => <option key={m} value={i+1}>{m}</option>)}
        </select>
        <select value={filters.pay_year}
          onChange={e => setFilters(f => ({ ...f, pay_year: parseInt(e.target.value) }))}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
          {[2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        {isAdmin && (
          <select value={filters.employee_id}
            onChange={e => setFilters(f => ({ ...f, employee_id: e.target.value }))}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
            <option value="">All Employees</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.full_name || e.name}</option>)}
          </select>
        )}
        <select value={filters.status}
          onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
          <option value="">All Status</option>
          <option value="DRAFT">Draft</option>
          <option value="GENERATED">Generated</option>
          <option value="PAID">Paid</option>
        </select>
        <button onClick={fetchPayslips}
          className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          🔍 Filter
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="text-center py-20 text-gray-400">Loading payslips…</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Employee</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Period</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600">Days</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Gross</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Deductions</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Net Pay</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600">Status</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {payslips.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-20 text-gray-400">
                    No payslips for {MONTHS[filters.pay_month-1]} {filters.pay_year}.<br/>
                    <span className="text-xs">Use "Generate Payslips" to create them.</span>
                  </td>
                </tr>
              ) : payslips.map(ps => {
                const emp = employees.find(e => e.id === ps.employee_id);
                return (
                  <tr key={ps.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800">{ps.employee_name || emp?.full_name || emp?.name || `EMP-${ps.employee_id}`}</div>
                      <div className="text-xs text-gray-400">{ps.department || emp?.department}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{MONTHS[ps.pay_month-1]} {ps.pay_year}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-gray-700">{ps.present_days}</span>
                      <span className="text-gray-400">/{ps.working_days}</span>
                      {ps.loss_of_pay_days > 0 && (
                        <span className="ml-1 text-xs text-red-500">(-{ps.loss_of_pay_days} LOP)</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-green-700 font-medium">{fmt(ps.gross_earnings)}</td>
                    <td className="px-4 py-3 text-right text-red-600">{fmt(ps.total_deductions)}</td>
                    <td className="px-4 py-3 text-right font-bold text-blue-700">{fmt(ps.net_pay)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[ps.status] || "bg-gray-100 text-gray-600"}`}>
                        {ps.status.charAt(0).toUpperCase() + ps.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5 flex-wrap">
                        <button onClick={() => setSelectedPayslip(ps)}
                          className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-gray-700 transition-colors">
                          View
                        </button>
                        <button onClick={() => downloadPdf(ps)}
                          className="text-xs px-2 py-1 bg-blue-100 hover:bg-blue-200 rounded text-blue-700 transition-colors">
                          PDF
                        </button>
                        {isAdmin && (
                          <button onClick={() => sendEmail(ps.id)}
                            className="text-xs px-2 py-1 bg-purple-100 hover:bg-purple-200 rounded text-purple-700 transition-colors">
                            Email
                          </button>
                        )}
                        {isAdmin && ps.status?.toUpperCase() !== "PAID" && (
                          <button onClick={() => markPaid(ps.id)}
                            className="text-xs px-2 py-1 bg-green-100 hover:bg-green-200 rounded text-green-700 transition-colors">
                            Mark Paid
                          </button>
                        )}
                        {isAdmin && (
                          <button onClick={() => deletePayslip(ps.id)}
                            className="text-xs px-2 py-1 bg-red-50 hover:bg-red-100 rounded text-red-600 transition-colors">
                            Del
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Generate Modal */}
      {showGenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40" onClick={() => setShowGenModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 z-10">
            <h2 className="text-lg font-bold text-gray-800 mb-4">Generate Payslips</h2>
            {error && <div className="mb-3 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">{error}</div>}

            {/* Mode tabs */}
            <div className="flex gap-2 mb-5">
              {["single","bulk"].map(m => (
                <button key={m} onClick={() => setGenForm(f => ({...f, mode:m}))}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${genForm.mode===m ? "bg-blue-700 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                  {m === "single" ? "Single Employee" : "All Employees"}
                </button>
              ))}
            </div>

            <div className="space-y-4">
              {genForm.mode === "single" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Employee *</label>
                  <select value={genForm.employee_id} onChange={e => {
                    const eid = e.target.value;
                    setGenForm(f => ({...f, employee_id: eid}));
                    if (eid) fetchAttendanceSummary(eid, genForm.pay_month, genForm.pay_year);
                  }}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">Select…</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.full_name || e.name}</option>)}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Month</label>
                  <select value={genForm.pay_month} onChange={e => {
                    const m = parseInt(e.target.value);
                    setGenForm(f => ({...f, pay_month: m}));
                    if (genForm.employee_id) fetchAttendanceSummary(genForm.employee_id, m, genForm.pay_year);
                  }}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {MONTHS.map((m,i) => <option key={m} value={i+1}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
                  <select value={genForm.pay_year} onChange={e => {
                    const y = parseInt(e.target.value);
                    setGenForm(f => ({...f, pay_year: y}));
                    if (genForm.employee_id) fetchAttendanceSummary(genForm.employee_id, genForm.pay_month, y);
                  }}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {[2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>

              {genForm.mode === "single" && (
                <div className="grid grid-cols-3 gap-3">
                  {genForm.loadingAttendance && (
                    <div className="col-span-3 text-xs text-blue-600 text-center">⏳ Fetching attendance data…</div>
                  )}
                  {[
                    { key: "working_days", label: "Working Days" },
                    { key: "present_days", label: "Present Days" },
                    { key: "paid_leaves",  label: "Paid Leaves"  },
                  ].map(({ key, label }) => (
                    <div key={key}>
                      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                      <input type="number" min="0" value={genForm[key]}
                        onChange={e => setGenForm(f => ({...f, [key]: e.target.value}))}
                        className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  ))}
                </div>
              )}

              {genForm.mode === "bulk" && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
                  ℹ️ Will generate payslips for all active employees using their attendance records.
                  Employees with existing payslips for this month will be skipped.
                </div>
              )}

              {genForm.mode === "single" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Remarks</label>
                  <input type="text" value={genForm.remarks} placeholder="Optional…"
                    onChange={e => setGenForm(f => ({...f, remarks: e.target.value}))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={generate} disabled={generating}
                className="flex-1 bg-blue-700 hover:bg-blue-800 text-white py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50">
                {generating ? "Generating…" : "Generate"}
              </button>
              <button onClick={() => setShowGenModal(false)}
                className="px-5 py-2.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payslip Detail Modal */}
      {selectedPayslip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40" onClick={() => setSelectedPayslip(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 z-10 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-lg font-bold text-gray-800">Payslip Detail</h2>
                <p className="text-sm text-gray-500">{MONTHS[selectedPayslip.pay_month-1]} {selectedPayslip.pay_year}</p>
              </div>
              <button onClick={() => setSelectedPayslip(null)} className="text-gray-400 hover:text-gray-600 text-2xl">×</button>
            </div>

            {/* Net Pay Banner */}
            <div className="bg-gradient-to-r from-blue-700 to-blue-500 text-white rounded-xl p-4 text-center mb-4">
              <p className="text-sm opacity-80">Net Pay</p>
              <p className="text-3xl font-bold">{fmt(selectedPayslip.net_pay)}</p>
              <p className="text-xs opacity-70 mt-1">{MONTHS[selectedPayslip.pay_month-1]} {selectedPayslip.pay_year}</p>
            </div>

            {/* Attendance */}
            <div className="grid grid-cols-4 gap-2 mb-4 text-center">
              {[
                { label:"Working",  value: selectedPayslip.working_days },
                { label:"Present",  value: selectedPayslip.present_days },
                { label:"Leaves",   value: selectedPayslip.paid_leaves  },
                { label:"LOP",      value: selectedPayslip.loss_of_pay_days, red: true },
              ].map(s => (
                <div key={s.label} className="bg-gray-50 rounded-lg p-2">
                  <p className={`text-lg font-bold ${s.red && s.value > 0 ? "text-red-600" : "text-gray-800"}`}>{s.value}</p>
                  <p className="text-xs text-gray-500">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Components */}
            {selectedPayslip.items && selectedPayslip.items.length > 0 && (
              <div className="space-y-1 mb-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Breakdown</h3>
                {selectedPayslip.items.map(item => (
                  <div key={item.id} className="flex justify-between items-center py-1.5 border-b border-gray-50">
                    <span className="text-sm text-gray-600">{item.label}</span>
                    <span className={`text-sm font-medium ${item.component_type === "earning" ? "text-green-700" : "text-red-600"}`}>
                      {item.component_type === "earning" ? "+" : "−"}{fmt(item.amount)}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between pt-2">
                  <span className="font-semibold text-gray-700">Gross Earnings</span>
                  <span className="font-bold text-green-700">{fmt(selectedPayslip.gross_earnings)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-semibold text-gray-700">Total Deductions</span>
                  <span className="font-bold text-red-600">{fmt(selectedPayslip.total_deductions)}</span>
                </div>
                <div className="flex justify-between border-t border-gray-200 pt-2 mt-1">
                  <span className="font-bold text-gray-800">Net Pay</span>
                  <span className="font-bold text-blue-700 text-lg">{fmt(selectedPayslip.net_pay)}</span>
                </div>
              </div>
            )}

            <div className="flex gap-3 mt-4">
              <button onClick={() => downloadPdf(selectedPayslip)}
                className="flex-1 bg-blue-700 hover:bg-blue-800 text-white py-2.5 rounded-lg font-medium transition-colors text-sm">
                ⬇ Download PDF
              </button>
              <button onClick={() => sendEmail(selectedPayslip.id)}
                className="flex-1 bg-purple-700 hover:bg-purple-800 text-white py-2.5 rounded-lg font-medium transition-colors text-sm">
                ✉ Email Employee
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mark All Paid Confirm Modal */}
      {confirmMarkAll && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setConfirmMarkAll(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 z-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center text-2xl">✅</div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Mark All as Paid</h3>
                <p className="text-sm text-gray-500">{confirmMarkAll.length} pending payslip(s)</p>
              </div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-5 text-sm text-amber-700">
              ⚠️ This will mark <strong>{confirmMarkAll.length}</strong> payslip(s) as PAID and automatically send payslip emails to all employees. This action cannot be undone.
            </div>
            <div className="bg-gray-50 rounded-lg p-3 mb-5 max-h-32 overflow-y-auto">
              {confirmMarkAll.map(ps => (
                <div key={ps.id} className="flex justify-between text-sm py-1 border-b border-gray-100 last:border-0">
                  <span className="text-gray-700">{ps.employee_name || ps.employee_id}</span>
                  <span className="text-blue-600 font-medium">{ps.net_pay ? fmt(ps.net_pay) : '—'}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={proceedMarkAll}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-lg font-medium transition-colors">
                ✅ Confirm Mark All Paid
              </button>
              <button onClick={() => setConfirmMarkAll(null)}
                className="px-5 py-2.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
