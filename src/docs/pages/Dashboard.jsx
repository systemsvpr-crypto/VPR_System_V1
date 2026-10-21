import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  FileText,
  CreditCard,
  Coins,
  RotateCcw,
  CheckCircle2,
  ShieldCheck,
  LayoutDashboard,
  Activity,
} from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { Button } from "@/components/ui/button";
import {
  documentsApi,
  subscriptionsApi,
  loansApi,
} from "../services/docsApi";
import { getUserAllowedDivisions, isDivisionAllowed } from "../utils/divisions";
import { formatDate, formatCurrency, isExpiringSoon, isOverdue } from "../utils/dateFormatter";
import { docsPath } from "../utils/access";
import {
  PageShell,
  PageHeader,
  KpiCard,
  KpiGrid,
  Card,
  LoadingState,
  EmptyState,
  useDocsData,
} from "../components/DocsUI";

// VPR chart palette (validated: lightness band, chroma, CVD separation).
const C = {
  blue: "#2f6bde",
  emerald: "#10b981",
  amber: "#f59e0b",
  red: "#ef4444",
  violet: "#8b5cf6",
  empty: "#e2e8f0",
};

const DOC_STATUS_COLORS = { Active: C.blue, Expiring: C.amber, Expired: C.red };
const SUB_STATUS_COLORS = { Paid: C.emerald, Pending: C.amber, Approved: C.blue, Rejected: C.red };
const LOAN_STATUS_COLORS = { Active: C.emerald, Closed: C.blue, Foreclosed: C.violet };

const buildChart = (counts, colors) => {
  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  const legend = Object.entries(counts).map(([name, value]) => ({ name, value, color: colors[name] }));
  if (total === 0) return { data: [{ name: "None", value: 1, color: C.empty }], legend, total: 0, isEmpty: true };
  return { data: legend.filter((d) => d.value > 0), legend, total, isEmpty: false };
};

const ChartTooltip = ({ active, payload, isEmpty }) => {
  if (!active || !payload?.length || isEmpty) return null;
  const p = payload[0];
  return (
    <div className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 shadow-sm text-xs">
      <span className="inline-block h-2 w-2 rounded-sm mr-1.5" style={{ background: p.payload.color }} />
      <span className="text-slate-500">{p.name}</span>
      <span className="ml-2 font-semibold text-slate-800 tabular-nums">{p.value}</span>
    </div>
  );
};

const DonutCard = ({ title, subtitle, chart }) => (
  <Card title={title} action={<span className="text-[11px] text-slate-400">{subtitle}</span>} bodyClassName="p-4 flex flex-col gap-3">
    <div className="relative h-44">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chart.data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={70}
            paddingAngle={chart.isEmpty || chart.data.length < 2 ? 0 : 2}
            stroke="#ffffff"
            strokeWidth={2}
            isAnimationActive={false}
          >
            {chart.data.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip isEmpty={chart.isEmpty} />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-2xl font-bold text-slate-800 tabular-nums">{chart.total}</span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Total</span>
      </div>
    </div>
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-3 border-t border-slate-100 text-[11px] text-slate-500">
      {chart.legend.map((l) => (
        <span key={l.name} className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm" style={{ background: l.color }} />
          {l.name}
          <span className="font-semibold text-slate-700 tabular-nums">{l.value}</span>
        </span>
      ))}
    </div>
  </Card>
);

const ACTIVITY_TONES = {
  "Document Added": "bg-blue-50 text-blue-600 border-blue-100",
  "Document Renewed": "bg-amber-50 text-amber-600 border-amber-100",
  "Subscription Added": "bg-violet-50 text-violet-600 border-violet-100",
  "Payment Recorded": "bg-emerald-50 text-emerald-600 border-emerald-100",
};

const SectionLabel = ({ children }) => (
  <h2 className="text-[11px] font-semibold text-slate-500 tracking-wider uppercase">{children}</h2>
);

export default function DocsDashboard() {
  const navigate = useNavigate();
  const { data, loading } = useDocsData(
    async () => {
      const [documents, subscriptions, loans, renewals, payments] = await Promise.all([
        documentsApi.list(),
        subscriptionsApi.list(),
        loansApi.list(),
        documentsApi.listRenewals(),
        subscriptionsApi.listPayments(),
      ]);
      return { documents, subscriptions, loans, renewals, payments };
    },
    { documents: [], subscriptions: [], loans: [], renewals: [], payments: [] }
  );
  const { documents, subscriptions, loans, renewals, payments } = data;

  const allowedDivisions = useMemo(() => getUserAllowedDivisions(), []);
  const inDivision = (r) => isDivisionAllowed(r.division || r.companyName, allowedDivisions);

  const filteredDocs = useMemo(() => documents.filter(inDivision), [documents, allowedDivisions]); // eslint-disable-line react-hooks/exhaustive-deps
  const filteredSubs = useMemo(() => subscriptions.filter(inDivision), [subscriptions, allowedDivisions]); // eslint-disable-line react-hooks/exhaustive-deps
  const filteredRenewals = useMemo(() => renewals.filter(inDivision), [renewals, allowedDivisions]); // eslint-disable-line react-hooks/exhaustive-deps
  const filteredPayments = useMemo(() => payments.filter(inDivision), [payments, allowedDivisions]); // eslint-disable-line react-hooks/exhaustive-deps

  const metrics = useMemo(() => {
    const expiringDocs = filteredDocs.filter(
      (d) => d.needsRenewal === "Yes" && d.renewalDate && (isExpiringSoon(d.renewalDate, 30) || isOverdue(d.renewalDate))
    );
    const monthlySpend = filteredSubs.reduce((sum, s) => {
      const price = Number(s.price) || 0;
      if (s.frequency === "Monthly") return sum + price;
      if (s.frequency === "Quarterly") return sum + price / 3;
      if (s.frequency === "Half-Yearly") return sum + price / 6;
      if (s.frequency === "Yearly") return sum + price / 12;
      return sum + price;
    }, 0);
    return {
      totalDocs: filteredDocs.length,
      renewalsPendingCount: expiringDocs.length,
      totalSubs: filteredSubs.length,
      monthlySpend,
      pendingApprovalsCount: filteredSubs.filter((s) => s.status === "Pending").length,
      totalLoans: loans.length,
      nocCompletedCount: loans.filter((l) => l.collectNocStatus === "Yes").length,
    };
  }, [filteredDocs, filteredSubs, loans]);

  const docChart = useMemo(() => {
    const counts = { Active: 0, Expiring: 0, Expired: 0 };
    filteredDocs.forEach((d) => {
      if (d.needsRenewal !== "Yes" || !d.renewalDate) counts.Active += 1;
      else if (isOverdue(d.renewalDate)) counts.Expired += 1;
      else if (isExpiringSoon(d.renewalDate, 30)) counts.Expiring += 1;
      else counts.Active += 1;
    });
    return buildChart(counts, DOC_STATUS_COLORS);
  }, [filteredDocs]);

  const subChart = useMemo(() => {
    const counts = { Paid: 0, Pending: 0, Approved: 0, Rejected: 0 };
    filteredSubs.forEach((s) => {
      if (counts[s.status] !== undefined) counts[s.status] += 1;
      else counts.Paid += 1;
    });
    return buildChart(counts, SUB_STATUS_COLORS);
  }, [filteredSubs]);

  const loanChart = useMemo(() => {
    const counts = { Active: 0, Closed: 0, Foreclosed: 0 };
    loans.forEach((l) => {
      if (l.foreclosureStatus === "Settled") counts.Foreclosed += 1;
      else if (l.status === "Closed" || l.collectNocStatus === "Yes") counts.Closed += 1;
      else counts.Active += 1;
    });
    return buildChart(counts, LOAN_STATUS_COLORS);
  }, [loans]);

  const recentActivities = useMemo(() => {
    const ts = (v) => (v ? new Date(v).getTime() : 0);
    const list = [
      ...filteredDocs.map((d) => ({
        id: `doc_${d.id}`,
        type: "Document Added",
        title: `New document '${d.documentName}' added under ${d.division || d.companyName || d.category}`,
        date: formatDate(d.createdAt),
        timestamp: ts(d.createdAt),
      })),
      ...filteredRenewals.map((r) => ({
        id: `ren_${r.id}`,
        type: "Document Renewed",
        title: `Document '${r.documentName}' renewed until ${formatDate(r.newRenewalDate)}`,
        date: formatDate(r.renewedAt),
        timestamp: ts(r.renewedAt),
      })),
      ...filteredSubs.map((s) => ({
        id: `sub_${s.id}`,
        type: "Subscription Added",
        title: `Subscription '${s.subscriptionName}' registered for ${s.subscriberName}`,
        date: formatDate(s.createdAt),
        timestamp: ts(s.createdAt),
      })),
      ...filteredPayments.map((p) => ({
        id: `pay_${p.id}`,
        type: "Payment Recorded",
        title: `Payment of ${formatCurrency(p.amountPaid)} recorded for '${p.subscriptionName}'`,
        date: formatDate(p.paymentDate),
        timestamp: ts(p.createdAt),
      })),
    ];
    return list.sort((a, b) => b.timestamp - a.timestamp).slice(0, 8);
  }, [filteredDocs, filteredRenewals, filteredSubs, filteredPayments]);

  if (loading) return <LoadingState text="Loading dashboard..." />;

  return (
    <PageShell>
      <PageHeader
        icon={LayoutDashboard}
        title="Docs & Subscriptions Dashboard"
        description="Documents, subscriptions and loans at a glance"
      />

      <SectionLabel>Resource Overview</SectionLabel>
      <KpiGrid cols={3}>
        <KpiCard
          icon={FileText}
          tone="blue"
          label="Total Documents"
          value={metrics.totalDocs}
          hint="All stored & tracked records"
          onClick={() => navigate(docsPath("docs_all_documents"))}
        />
        <KpiCard
          icon={CreditCard}
          tone="violet"
          label="Total Subscriptions"
          value={metrics.totalSubs}
          hint={`₹${Math.round(metrics.monthlySpend).toLocaleString("en-IN")} / mo estimated spend`}
          onClick={() => navigate(docsPath("docs_all_subscriptions"))}
        />
        <KpiCard
          icon={Coins}
          tone="emerald"
          label="Total Loans"
          value={metrics.totalLoans}
          hint="Active bank finance records"
          onClick={() => navigate(docsPath("docs_all_loans"))}
        />
      </KpiGrid>

      <SectionLabel>Action Items & Compliance Status</SectionLabel>
      <KpiGrid cols={3}>
        <KpiCard
          icon={RotateCcw}
          tone="amber"
          label="Renewals Pending"
          value={metrics.renewalsPendingCount}
          hint="Documents requiring renewal"
          onClick={() => navigate(docsPath("docs_document_renewal"))}
        />
        <KpiCard
          icon={CheckCircle2}
          tone="blue"
          label="Pending Approvals"
          value={metrics.pendingApprovalsCount}
          hint="Subscriptions waiting for approval"
          onClick={() => navigate(docsPath("docs_subscription_approval"))}
        />
        <KpiCard
          icon={ShieldCheck}
          tone="emerald"
          label="NOC Completed"
          value={metrics.nocCompletedCount}
          hint="Loans with NOC safely received"
          onClick={() => navigate(docsPath("docs_loan_noc"))}
        />
      </KpiGrid>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <DonutCard title="Subscriptions" subtitle="By current status" chart={subChart} />
        <DonutCard title="Documents" subtitle="By renewal status" chart={docChart} />
        <DonutCard title="Loans" subtitle="By closure & active status" chart={loanChart} />
      </div>

      <Card title="Recent Activity Timeline" icon={Activity} bodyClassName="px-2 py-1">
        {recentActivities.length === 0 ? (
          <div className="py-8">
            <EmptyState icon={Activity} title="No recent activity" message="Activity appears here as records are added." />
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {recentActivities.map((act) => (
              <li
                key={act.id}
                className="py-2.5 px-2 flex items-center justify-between gap-3 rounded-lg hover:bg-slate-50/60 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${ACTIVITY_TONES[act.type]}`}>
                    <FileText size={14} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-700 truncate">{act.type}</p>
                    <p className="text-[11px] text-slate-500 truncate">{act.title}</p>
                  </div>
                </div>
                <span className="text-[11px] text-slate-400 tabular-nums shrink-0">{act.date}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </PageShell>
  );
}
