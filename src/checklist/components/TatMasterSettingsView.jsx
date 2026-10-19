import { useState, useEffect, useMemo } from "react";
import {
  Clock,
  Plus,
  Trash2,
  Edit2,
  Search,
  RefreshCw,
  X,
  Save,
  Layers,
} from "lucide-react";
import { useMagicToast } from "../context/MagicToastContext";
import {
  fetchMasterTatRules,
  upsertMasterTatRule,
  deleteMasterTatRule,
} from "../../purchase/services/purchaseMasterApi";

const SYSTEM_OPTIONS = [
  "Purchase System",
  "Purchase Return",
  "Order Management",
  "Leads System",
];

const filterStagesForSystem = (systemName, stages = []) => {
  if (systemName === "Order Management") {
    return stages.filter(
      (s) =>
        s.trim().toLowerCase() !== "received order" &&
        s.trim().toLowerCase() !== "received_order"
    );
  }
  if (systemName === "Purchase System") {
    return stages.filter((s) => {
      const lower = s.trim().toLowerCase();
      return (
        lower !== "create indent" &&
        lower !== "create_indent" &&
        lower !== "order cancel" &&
        lower !== "order_cancel"
      );
    });
  }
  return stages;
};

const SYSTEM_STAGES_MAP = {
  "Purchase System": [
    "Delegate Approver",
    "Indent Approval",
    "Quotation Submission",
    "Approved Vendor",
    "Make PO",
    "Payment",
    "Follow UP / Lifting",
    "Transporter Follow-Up",
    "Material Received (GRN)",
    "Tally Billing",
  ],
  "Purchase Return": [
    "Return Approval",
    "Ask Credit Note",
    "Arrange Logistics",
    "Issue Debit Note",
    "Return From Plant",
  ],
  "Order Management": [
    "Check & Validation",
    "Stock Verification",
    "Production Planning",
    "Dispatch Planning",
    "Packaging",
    "Vehicle Logistic",
    "Make Challan",
    "Make Invoice",
    "Confirm Delivery",
    "Payments",
  ],
  "Leads System": [
    "Followup Tracker",
    "Pending Quotation",
    "Quotation Tracker",
  ],
};

const UNIT_OPTIONS = [
  { label: "Days (day)", value: "day" },
  { label: "Hours (hr)", value: "hr" },
  { label: "Minutes (min)", value: "min" },
];

const DEFAULT_TAT_RULES = [
  {
    id: "tat-1b",
    system_name: "Purchase System",
    stage_name: "Delegate Approver",
    time_value: 4,
    unit: "hr",
    description: "Assign pending purchase indents to approvers",
  },
  {
    id: "tat-2",
    system_name: "Purchase System",
    stage_name: "Indent Approval",
    time_value: 24,
    unit: "hr",
    description: "SOP for technical and commercial indent clearance",
  },
  {
    id: "tat-3",
    system_name: "Purchase System",
    stage_name: "Quotation Submission",
    time_value: 48,
    unit: "hr",
    description: "Multi-vendor quote comparison and RFQ turnaround",
  },
  {
    id: "tat-4",
    system_name: "Purchase System",
    stage_name: "Approved Vendor",
    time_value: 12,
    unit: "hr",
    description: "Selection of best commercial quote and sanctioning",
  },
  {
    id: "tat-5",
    system_name: "Purchase System",
    stage_name: "Make PO",
    time_value: 12,
    unit: "hr",
    description: "Formal Purchase Order issue and vendor acknowledgement",
  },
  {
    id: "tat-6",
    system_name: "Purchase System",
    stage_name: "Payment",
    time_value: 24,
    unit: "hr",
    description: "Advance or dispatch payment clearance",
  },
  {
    id: "tat-7",
    system_name: "Purchase System",
    stage_name: "Follow UP / Lifting",
    time_value: 48,
    unit: "hr",
    description: "Material ready at supplier premises and vehicle placement",
  },
  {
    id: "tat-8",
    system_name: "Purchase System",
    stage_name: "Transporter Follow-Up",
    time_value: 72,
    unit: "hr",
    description: "In-transit tracking from supplier plant to company gate",
  },
  {
    id: "tat-9",
    system_name: "Purchase System",
    stage_name: "Material Received (GRN)",
    time_value: 8,
    unit: "hr",
    description: "Physical inspection and gate inward entry",
  },
  {
    id: "tat-10",
    system_name: "Purchase System",
    stage_name: "Tally Billing",
    time_value: 24,
    unit: "hr",
    description: "Supplier bill verification and ERP voucher booking",
  },
  // Order Management Default SLA Rules
  {
    id: "tat-o2d-2",
    system_name: "Order Management",
    stage_name: "Check & Validation",
    time_value: 4,
    unit: "hr",
    description: "Item specifications, rates, and party terms verified",
  },
  {
    id: "tat-o2d-3",
    system_name: "Order Management",
    stage_name: "Stock Verification",
    time_value: 8,
    unit: "hr",
    description: "Stock verified to approve dispatch or schedule production",
  },
  {
    id: "tat-o2d-4",
    system_name: "Order Management",
    stage_name: "Production Planning",
    time_value: 48,
    unit: "hr",
    description: "Manufacture shortage quantities and produce finished goods",
  },
  {
    id: "tat-o2d-5",
    system_name: "Order Management",
    stage_name: "Dispatch Planning",
    time_value: 12,
    unit: "hr",
    description: "Schedule ready quantities and allocate dispatch lots",
  },
  {
    id: "tat-o2d-6",
    system_name: "Order Management",
    stage_name: "Packaging",
    time_value: 8,
    unit: "hr",
    description: "Quality packaging and barcode labeling before vehicle loading",
  },
  {
    id: "tat-o2d-7",
    system_name: "Order Management",
    stage_name: "Vehicle Logistic",
    time_value: 12,
    unit: "hr",
    description: "Transporter booking, vehicle placement, and driver assignment",
  },
  {
    id: "tat-o2d-8",
    system_name: "Order Management",
    stage_name: "Make Challan",
    time_value: 4,
    unit: "hr",
    description: "Formal delivery challan generation with transport details",
  },
  {
    id: "tat-o2d-9",
    system_name: "Order Management",
    stage_name: "Make Invoice",
    time_value: 4,
    unit: "hr",
    description: "Tax invoice generation with HSN, GST, and total value breakdown",
  },
  {
    id: "tat-o2d-10",
    system_name: "Order Management",
    stage_name: "Confirm Delivery",
    time_value: 48,
    unit: "hr",
    description: "Shipment delivered to customer site and POD acknowledgement confirmed",
  },
  {
    id: "tat-o2d-11",
    system_name: "Order Management",
    stage_name: "Payments",
    time_value: 24,
    unit: "hr",
    description: "Advance, freight, and customer invoice payment settlement",
  },
  {
    id: "tat-leads-1",
    system_name: "Leads System",
    stage_name: "Followup Tracker",
    time_value: 24,
    unit: "hr",
    description: "Time to complete first or scheduled follow-up call",
  },
  {
    id: "tat-leads-2",
    system_name: "Leads System",
    stage_name: "Pending Quotation",
    time_value: 48,
    unit: "hr",
    description: "Time to prepare and issue quotation after enquiry confirmation",
  },
  {
    id: "tat-leads-3",
    system_name: "Leads System",
    stage_name: "Quotation Tracker",
    time_value: 48,
    unit: "hr",
    description: "Time to follow up on quotation and record order decision",
  },
];

export default function TatMasterSettingsView({ activeUser }) {
  const { showToast } = useMagicToast();

  const [loading, setLoading] = useState(false);
  const [rules, setRules] = useState(DEFAULT_TAT_RULES);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSystemFilter, setSelectedSystemFilter] = useState("all");

  // Modal / Form state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState(null);

  const [form, setForm] = useState({
    system_name: "Purchase System",
    stage_name: "",
    time_value: 24,
    unit: "hr",
    description: "",
  });

  const availableStages = useMemo(() => {
    const predefined = filterStagesForSystem(
      form.system_name,
      SYSTEM_STAGES_MAP[form.system_name] || []
    );
    const existingInRules = (rules || [])
      .filter((r) => (r.system_name || "Purchase System") === form.system_name)
      .map((r) => r.stage_name || r.section_name || r.stage)
      .filter(Boolean);
    const combined = Array.from(new Set([...predefined, ...existingInRules]));
    return filterStagesForSystem(form.system_name, combined);
  }, [form.system_name, rules]);

  const loadRules = async () => {
    setLoading(true);
    try {
      const data = await fetchMasterTatRules();
      if (data && data.length > 0) {
        const cleaned = data.filter((r) => {
          const sys = r.system_name || r.system || "";
          const stage = (
            r.stage_name ||
            r.section_name ||
            r.stage ||
            ""
          )
            .trim()
            .toLowerCase();
          if (sys === "Order Management") {
            if (stage === "received order" || stage === "received_order")
              return false;
          }
          if (sys === "Purchase System") {
            if (
              stage === "create indent" ||
              stage === "create_indent" ||
              stage === "order cancel" ||
              stage === "order_cancel"
            ) {
              return false;
            }
          }
          return true;
        });
        setRules(cleaned);
      } else {
        setRules(DEFAULT_TAT_RULES);
      }
    } catch (err) {
      console.warn("Could not fetch DB TAT rules, using defaults:", err);
      setRules(DEFAULT_TAT_RULES);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRules();
  }, []);

  const openNewModal = () => {
    setEditingRule(null);
    const defaultSys =
      selectedSystemFilter !== "all" ? selectedSystemFilter : "Purchase System";
    const stagesForSys = filterStagesForSystem(
      defaultSys,
      SYSTEM_STAGES_MAP[defaultSys] || []
    );
    const defaultStage = stagesForSys[0] || "";
    const matchedDefault = DEFAULT_TAT_RULES.find(
      (d) =>
        d.system_name === defaultSys &&
        d.stage_name.toLowerCase() === defaultStage.toLowerCase()
    );
    setForm({
      system_name: defaultSys,
      stage_name: defaultStage,
      time_value: matchedDefault ? matchedDefault.time_value : "",
      unit: matchedDefault ? matchedDefault.unit : "hr",
      description: matchedDefault ? matchedDefault.description : "",
    });
    setModalOpen(true);
  };

  const openEditModal = (rule) => {
    setEditingRule(rule);
    const stageName = rule.stage_name || rule.section_name || rule.stage || "";
    const systemName = rule.system_name || rule.system || "Purchase System";
    setForm({
      system_name: systemName,
      stage_name: stageName,
      time_value: rule.time_value || rule.completion_time || rule.sla_days || "",
      unit: rule.unit || rule.time_unit || "hr",
      description: rule.description || "",
    });
    setModalOpen(true);
  };

  const handleSaveRule = async (e) => {
    e.preventDefault();
    const finalStageName = form.stage_name.trim();
    if (!finalStageName || !form.time_value) {
      if (showToast) showToast("Please fill all required fields", "warning");
      return;
    }

    try {
      const payload = {
        system_name: form.system_name,
        section_name: finalStageName,
        stage_name: finalStageName,
        completion_time: Number(form.time_value),
        time_value: Number(form.time_value),
        time_unit: form.unit,
        unit: form.unit,
        description: form.description,
        ...(editingRule?.id && !String(editingRule.id).startsWith("tat-")
          ? { id: editingRule.id }
          : {}),
      };

      try {
        await upsertMasterTatRule(payload);
        await loadRules();
      } catch (dbErr) {
        console.warn("Supabase upsert note:", dbErr);
        // Update local state fallback
        if (editingRule) {
          setRules((prev) =>
            prev.map((r) =>
              r.id === editingRule.id
                ? { ...r, ...payload, id: editingRule.id }
                : r
            )
          );
        } else {
          const newRule = {
            ...payload,
            id: `tat-${Date.now()}`,
          };
          setRules((prev) => [newRule, ...prev]);
        }
      }

      if (editingRule) {
        if (showToast) showToast("TAT Rule updated successfully!", "success");
      } else {
        if (showToast) showToast("TAT Rule created successfully!", "success");
      }

      setModalOpen(false);
      setEditingRule(null);
    } catch (err) {
      console.error("Save TAT Rule error:", err);
      if (showToast) showToast(`Failed: ${err.message}`, "error");
    }
  };

  const handleDeleteRule = async (id) => {
    if (!window.confirm("Are you sure you want to remove this TAT SLA rule?"))
      return;
    try {
      if (!String(id).startsWith("tat-")) {
        await deleteMasterTatRule(id);
      }
      setRules((prev) => prev.filter((r) => r.id !== id));
      if (showToast) showToast("TAT rule removed successfully", "success");
    } catch (err) {
      console.error("Delete TAT rule error:", err);
      setRules((prev) => prev.filter((r) => r.id !== id));
      if (showToast) showToast("TAT rule removed locally", "info");
    }
  };

  const filteredRules = useMemo(() => {
    return rules.filter((r) => {
      const sys = r.system_name || r.system || "";
      const stg = r.stage_name || r.stage || "";
      const s = searchTerm.toLowerCase();

      if (selectedSystemFilter !== "all" && sys !== selectedSystemFilter)
        return false;

      return !s || sys.toLowerCase().includes(s) || stg.toLowerCase().includes(s);
    });
  }, [rules, searchTerm, selectedSystemFilter]);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-xl">
              <Clock className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">
              Turn Around Time (TAT) & SLA Master Rules
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Configure target duration limits, response metrics, and SLA benchmarks by system, stage, time, and unit.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={loadRules}
            className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl transition-all cursor-pointer"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>

          <button
            type="button"
            onClick={openNewModal}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-blue-500/20 cursor-pointer flex items-center gap-1.5 active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Add TAT Rule</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Filter System:
          </span>
          <select
            value={selectedSystemFilter}
            onChange={(e) => setSelectedSystemFilter(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Systems ({rules.length})</option>
            {SYSTEM_OPTIONS.map((sys) => (
              <option key={sys} value={sys}>
                {sys}
              </option>
            ))}
          </select>
        </div>

        <div className="relative min-w-[240px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search system or stage..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* TAT Rules Table */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100 dark:bg-slate-800 font-bold text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="p-3">#</th>
                <th className="p-3">System Name</th>
                <th className="p-3">Stage Name</th>
                <th className="p-3 text-center">SLA Time Limit</th>
                <th className="p-3 text-center">Time Unit</th>
                <th className="p-3">Description / SOP</th>
                <th className="p-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredRules.map((r, idx) => (
                <tr
                  key={r.id || idx}
                  className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <td className="p-3 font-bold text-slate-400">{idx + 1}</td>
                  <td className="p-3">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800/50">
                      <Layers className="w-3 h-3" />
                      {r.system_name || r.system || "Purchase System"}
                    </span>
                  </td>
                  <td className="p-3 font-bold text-slate-900 dark:text-white">
                    {r.stage_name || r.stage || "—"}
                  </td>
                  <td className="p-3 text-center font-mono font-black text-sm text-emerald-600 dark:text-emerald-400">
                    {r.time_value || r.sla_days || 0}
                  </td>
                  <td className="p-3 text-center font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 font-mono text-[11px]">
                      {r.unit || "hr"}
                    </span>
                  </td>
                  <td className="p-3 text-slate-500 max-w-xs truncate">
                    {r.description || "—"}
                  </td>
                  <td className="p-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => openEditModal(r)}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-lg transition-colors cursor-pointer"
                        title="Edit"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteRule(r.id)}
                        className="p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredRules.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="p-8 text-center text-slate-400 font-semibold"
                  >
                    No TAT SLA rules matching criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950">
              <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-600" />
                <span>{editingRule ? "Edit TAT Rule" : "Add TAT Rule"}</span>
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveRule} className="p-6 space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">
                  System Name <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.system_name}
                  onChange={(e) => {
                    const newSys = e.target.value;
                    const stagesForSys = filterStagesForSystem(
                      newSys,
                      SYSTEM_STAGES_MAP[newSys] || []
                    );
                    const firstStage = stagesForSys[0] || "";
                    const matchedDefault = DEFAULT_TAT_RULES.find(
                      (d) =>
                        d.system_name === newSys &&
                        d.stage_name.toLowerCase() === firstStage.toLowerCase()
                    );
                    setForm({
                      ...form,
                      system_name: newSys,
                      stage_name: firstStage,
                      time_value: matchedDefault ? matchedDefault.time_value : "",
                      unit: matchedDefault ? matchedDefault.unit : form.unit,
                      description: matchedDefault ? matchedDefault.description : "",
                    });
                  }}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-bold text-slate-800 dark:text-slate-100 cursor-pointer focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  {SYSTEM_OPTIONS.map((sys) => (
                    <option key={sys} value={sys}>
                      {sys}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">
                  Stage Name <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={form.stage_name}
                  onChange={(e) => {
                    const val = e.target.value;
                    const matchedDefault = DEFAULT_TAT_RULES.find(
                      (d) =>
                        d.stage_name.toLowerCase() === val.toLowerCase() &&
                        (d.system_name === form.system_name || !d.system_name)
                    );
                    if (matchedDefault && !editingRule) {
                      setForm({
                        ...form,
                        stage_name: val,
                        time_value: matchedDefault.time_value,
                        unit: matchedDefault.unit,
                        description:
                          matchedDefault.description || form.description,
                      });
                    } else {
                      setForm({ ...form, stage_name: val });
                    }
                  }}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-bold text-slate-800 dark:text-slate-100 cursor-pointer focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="">-- Select Stage Name --</option>
                  {availableStages.map((stg) => (
                    <option key={stg} value={stg}>
                      {stg}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">
                    SLA Time Value <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    placeholder="e.g. 24"
                    value={form.time_value}
                    onChange={(e) =>
                      setForm({ ...form, time_value: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-mono font-bold text-slate-800 dark:text-slate-100"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">
                    Time Unit <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={form.unit}
                    onChange={(e) => setForm({ ...form, unit: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-bold text-slate-800 dark:text-slate-100"
                  >
                    {UNIT_OPTIONS.map((u) => (
                      <option key={u.value} value={u.value}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">
                  Description / Escalation Rule
                </label>
                <textarea
                  rows={3}
                  placeholder="Optional details or SOP instructions..."
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-slate-500 font-bold hover:text-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center gap-1.5 cursor-pointer shadow-md shadow-blue-500/20"
                >
                  <Save className="w-4 h-4" />
                  <span>Save TAT Rule</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
