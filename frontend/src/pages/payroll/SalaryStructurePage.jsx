import React, { useState, useEffect } from "react";
import axios from "axios";

const API = process.env.REACT_APP_API_URL || "http://localhost:8002";

const COMPONENT_OPTIONS = [
  // Earnings
  { value: "basic",            label: "Basic Salary",          type: "earning"   },
  { value: "hra",              label: "House Rent Allowance",   type: "earning"   },
  { value: "transport",        label: "Transport Allowance",    type: "earning"   },
  { value: "medical",          label: "Medical Allowance",      type: "earning"   },
  { value: "special_allowance",label: "Special Allowance",      type: "earning"   },
  { value: "other_earning",    label: "Other Earning",          type: "earning"   },
  // Deductions
  { value: "pf",               label: "Provident Fund (PF)",    type: "deduction" },
  { value: "esi",              label: "ESI",                    type: "deduction" },
  { value: "professional_tax", label: "Professional Tax",       type: "deduction" },
  { value: "tds",              label: "TDS",                    type: "deduction" },
  { value: "loan",             label: "Loan Deduction",         type: "deduction" },
  { value: "other_deduction",  label: "Other Deduction",        type: "deduction" },
];

const defaultComponents = [
  { component: "basic",            component_type: "earning",   amount: 0, is_percentage: false },
  { component: "hra",              component_type: "earning",   amount: 0, is_percentage: false },
  { component: "pf",               component_type: "deduction", amount: 0, is_percentage: false },
  { component: "professional_tax", component_type: "deduction", amount: 0, is_percentage: false },
];

export default function SalaryStructurePage() {
  const [structures, setStructures]   = useState([]);
  const [employees, setEmployees]     = useState([]);
  const [showForm, setShowForm]       = useState(false);
  const [editTarget, setEditTarget]   = useState(null);
  const [loading, setLoading]         = useState(false);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState("");
  const [successMsg, setSuccessMsg]   = useState("");

  const [form, setForm] = useState({
    employee_id: "",
    effective_from: new Date().toISOString().split("T")[0],
    effective_to: "",
    currency: "INR",
    notes: "",
    components: [...defaultComponents.map(c => ({ ...c }))],
  });

  useEffect(() => { fetchAll(); }, []);

  const authHeader = () => {
    const token = localStorage.getItem("token");
    return { headers: { Authorization: `Bearer ${token}` } };
  };

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [ssRes, empRes] = await Promise.all([
        axios.get(`${API}/api/payroll/salary-structures`, authHeader()),
        axios.get(`${API}/api/employees/`, authHeader()),
      ]);
      setStructures(ssRes.data || []);
      const rawEmps = (empRes.data || []);
      // /api/employees/ may return user_id instead of id
      const emps = rawEmps.map(e => ({
        ...e,
        id: e.user_id || e.id, emp_table_id: e.id,
        full_name: e.full_name || e.name || e.email,
      })).filter(e => e.role !== "admin" && e.is_active !== false);
      setEmployees(emps);
    } catch (e) {
      setError("Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditTarget(null);
    setForm({
      employee_id: "",
      effective_from: new Date().toISOString().split("T")[0],
      effective_to: "",
      currency: "INR",
      notes: "",
      components: defaultComponents.map(c => ({ ...c })),
    });
    setShowForm(true);
    setError("");
  };

  const openEdit = (ss) => {
    setEditTarget(ss);
    setForm({
      employee_id: ss.employee_id,
      effective_from: ss.effective_from,
      effective_to: ss.effective_to || "",
      currency: ss.currency || "INR",
      notes: ss.notes || "",
      components: ss.components.map(c => ({
        component: c.component,
        component_type: c.component_type,
        amount: c.amount,
        is_percentage: c.is_percentage,
      })),
    });
    setShowForm(true);
    setError("");
  };

  const addComponent = () => {
    setForm(f => ({
      ...f,
      components: [...f.components, { component: "other_earning", component_type: "earning", amount: 0, is_percentage: false }],
    }));
  };

  const removeComponent = (idx) => {
    setForm(f => ({ ...f, components: f.components.filter((_, i) => i !== idx) }));
  };

  const updateComponent = (idx, field, value) => {
    setForm(f => {
      const comps = [...f.components];
      comps[idx] = { ...comps[idx], [field]: value };
      if (field === "component") {
        const opt = COMPONENT_OPTIONS.find(o => o.value === value);
        if (opt) comps[idx].component_type = opt.type;
      }
      return { ...f, components: comps };
    });
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const payload = {
        ...form,
        employee_id: parseInt(form.employee_id),
        effective_to: form.effective_to || null,
        components: form.components.map(c => ({ ...c, amount: parseFloat(c.amount) || 0 })),
      };
      if (editTarget) {
        await axios.put(`${API}/api/payroll/salary-structures/${editTarget.id}`, payload, authHeader());
      } else {
        await axios.post(`${API}/api/payroll/salary-structures`, payload, authHeader());
      }
      setSuccessMsg(editTarget ? "Salary structure updated!" : "Salary structure created!");
      setShowForm(false);
      fetchAll();
      setTimeout(() => setSuccessMsg(""), 3000);
    } catch (e) {
      setError(e.response?.data?.detail || "Failed to save salary structure");
    } finally {
      setSaving(false);
    }
  };

  const deleteStructure = async (id) => {
    if (!window.confirm("Delete this salary structure?")) return;
    try {
      await axios.delete(`${API}/api/payroll/salary-structures/${id}`, authHeader());
      fetchAll();
    } catch {
      setError("Failed to delete");
    }
  };

  const fmt = (n) => `₹${(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

  const earnings   = (comps) => comps?.filter(c => c.component_type === "earning").reduce((a,c) => a + c.amount, 0) || 0;
  const deductions = (comps) => comps?.filter(c => c.component_type === "deduction").reduce((a,c) => a + c.amount, 0) || 0;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Salary Structures</h1>
          <p className="text-gray-500 text-sm mt-0.5">Define and manage employee salary packages</p>
        </div>
        <button
          onClick={openCreate}
          className="bg-blue-700 hover:bg-blue-800 text-white px-5 py-2.5 rounded-lg font-medium flex items-center gap-2 transition-colors"
        >
          <span className="text-lg">+</span> New Structure
        </button>
      </div>

      {successMsg && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg flex items-center gap-2">
          <span>✓</span> {successMsg}
        </div>
      )}
      {error && !showForm && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error}</div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-20 text-gray-400">Loading…</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Employee</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Effective From</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Gross Salary</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Deductions</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Net Salary</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600">Status</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {structures.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-16 text-gray-400">No salary structures yet. Create one to get started.</td></tr>
              ) : structures.map(ss => {
                const emp = employees.find(e => e.id === ss.employee_id);
                const gross = ss.gross_salary ?? earnings(ss.components);
                const ded   = ss.total_deductions ?? deductions(ss.components);
                const net   = ss.net_salary ?? (gross - ded);
                return (
                  <tr key={ss.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800">{emp?.name || `Employee #${ss.employee_id}`}</div>
                      <div className="text-xs text-gray-400">{emp?.email}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{ss.effective_from}</td>
                    <td className="px-4 py-3 text-right font-medium text-green-700">{fmt(gross)}</td>
                    <td className="px-4 py-3 text-right text-red-600">{fmt(ded)}</td>
                    <td className="px-4 py-3 text-right font-bold text-blue-700">{fmt(net)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${ss.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                        {ss.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => openEdit(ss)} className="text-blue-600 hover:text-blue-800 text-xs font-medium">Edit</button>
                        <button onClick={() => deleteStructure(ss.id)} className="text-red-500 hover:text-red-700 text-xs font-medium">Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Slide-over form */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/40" onClick={() => setShowForm(false)} />
          <div className="relative ml-auto w-full max-w-2xl bg-white h-full overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex justify-between items-center z-10">
              <h2 className="text-lg font-bold text-gray-800">
                {editTarget ? "Edit Salary Structure" : "New Salary Structure"}
              </h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>

            <div className="p-6 space-y-5">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
              )}

              {/* Employee */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Employee *</label>
                <select
                  value={form.employee_id}
                  onChange={e => setForm(f => ({ ...f, employee_id: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select employee…</option>
                  {employees.map(e => (
                    <option key={e.id} value={e.id}>{e.name} ({e.email})</option>
                  ))}
                </select>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Effective From *</label>
                  <input type="date" value={form.effective_from}
                    onChange={e => setForm(f => ({ ...f, effective_from: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Effective To</label>
                  <input type="date" value={form.effective_to}
                    onChange={e => setForm(f => ({ ...f, effective_to: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <input type="text" value={form.notes} placeholder="Optional note…"
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              {/* Components */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-medium text-gray-700">Salary Components</label>
                  <button onClick={addComponent}
                    className="text-blue-600 hover:text-blue-800 text-xs font-medium flex items-center gap-1">
                    + Add Component
                  </button>
                </div>
                <div className="space-y-2">
                  {form.components.map((comp, idx) => (
                    <div key={idx} className={`flex gap-2 p-3 rounded-lg border ${comp.component_type === "earning" ? "bg-green-50 border-green-100" : "bg-red-50 border-red-100"}`}>
                      <select value={comp.component}
                        onChange={e => updateComponent(idx, "component", e.target.value)}
                        className="flex-1 border border-gray-200 rounded px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-400">
                        {COMPONENT_OPTIONS.map(o => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                      <div className="flex items-center gap-1">
                        <span className="text-sm text-gray-500">₹</span>
                        <input type="number" value={comp.amount} min="0"
                          onChange={e => updateComponent(idx, "amount", e.target.value)}
                          className="w-28 border border-gray-200 rounded px-2 py-1.5 text-sm text-right bg-white focus:outline-none focus:ring-1 focus:ring-blue-400" />
                      </div>
                      <span className={`self-center text-xs font-medium px-2 py-0.5 rounded-full ${comp.component_type === "earning" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                        {comp.component_type === "earning" ? "+" : "−"}
                      </span>
                      <button onClick={() => removeComponent(idx)} className="text-gray-300 hover:text-red-500 text-lg leading-none">×</button>
                    </div>
                  ))}
                </div>

                {/* Live totals */}
                {form.components.length > 0 && (() => {
                  const gross = form.components.filter(c => c.component_type === "earning").reduce((a,c) => a + (parseFloat(c.amount) || 0), 0);
                  const ded   = form.components.filter(c => c.component_type === "deduction").reduce((a,c) => a + (parseFloat(c.amount) || 0), 0);
                  return (
                    <div className="mt-3 flex gap-4 text-sm bg-blue-50 border border-blue-100 rounded-lg p-3">
                      <div><span className="text-gray-500">Gross:</span> <span className="font-bold text-green-700">{fmt(gross)}</span></div>
                      <div><span className="text-gray-500">Deductions:</span> <span className="font-bold text-red-600">{fmt(ded)}</span></div>
                      <div><span className="text-gray-500">Net:</span> <span className="font-bold text-blue-700">{fmt(gross - ded)}</span></div>
                    </div>
                  );
                })()}
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button onClick={save} disabled={saving}
                  className="flex-1 bg-blue-700 hover:bg-blue-800 text-white py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50">
                  {saving ? "Saving…" : editTarget ? "Update Structure" : "Create Structure"}
                </button>
                <button onClick={() => setShowForm(false)}
                  className="px-5 py-2.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
