import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Truck, Search, RotateCw, X, Package, Warehouse, CheckCircle2, Route, ExternalLink, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { getAawakDeliveries } from '../../services/purchaseService';
import { getAllTransporters, getLiftsMovedOutOfTransporterGodown } from '../../services/transporterService';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dropdown } from '@/components/ui/dropdown';
import { DatePicker } from '@/components/ui/date-picker';
import TableScrollSync from '@/components/TableScrollSync';
import ProductImsModal, { ImsButton } from '@/components/ProductImsModal';

const formatNum = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const formatDate = (d) => (d ? format(new Date(d), 'dd/MM/yyyy') : '—');

// Where a lift is now. A lift that reached the transporter's godown counts
// as Inward there; once it moves on to our godown it is also Outward from
// it; while it's still there it is Remaining.
const STAGES = {
  transit: { label: 'In Transit', pill: 'bg-violet-50 text-violet-700 border-violet-200', aawakSub: 'pending' },
  tpt: { label: 'At Transporter Godown', pill: 'bg-amber-50 text-amber-700 border-amber-200', aawakSub: 'transporter-godown' },
  viaTpt: { label: 'Delivered via TP Godown', pill: 'bg-emerald-50 text-emerald-700 border-emerald-200', aawakSub: 'history' },
  direct: { label: 'Delivered Direct', pill: 'bg-sky-50 text-sky-700 border-sky-200', aawakSub: 'history' },
};
const getStage = (status, liftNo, movedOut) => {
  if (status === 'In Transport Godown' || status === 'AT TPT GDN') return 'tpt';
  if (status === 'Arrived' || status === 'Received') return movedOut.has(liftNo) ? 'viaTpt' : 'direct';
  return 'transit';
};

const EMPTY = () => ({ lifts: 0, lifted: 0, transit: 0, tpIn: 0, tpOut: 0, tpRemaining: 0, delivered: 0, lastLift: null });
const addLift = (acc, l) => {
  acc.lifts += 1;
  acc.lifted += l.qty;
  if (l.stage === 'transit') acc.transit += l.qty;
  if (l.stage === 'tpt') { acc.tpIn += l.qty; acc.tpRemaining += l.qty; }
  if (l.stage === 'viaTpt') { acc.tpIn += l.qty; acc.tpOut += l.qty; acc.delivered += l.qty; }
  if (l.stage === 'direct') acc.delivered += l.qty;
  if (l.liftDate && (!acc.lastLift || l.liftDate > acc.lastLift)) acc.lastLift = l.liftDate;
  return acc;
};

const TABS = [
  { id: 'transporters', label: 'Transporter Summary' },
  { id: 'products', label: 'Product Summary' },
  { id: 'lifts', label: 'All Transactions' },
];

/**
 * Transporter Transactions — every purchase lift a transporter has carried:
 * what's on the road, and for the transporter's own godown how much came In,
 * went Out to our godowns, and is Remaining there. Each lift links to its row
 * in Purchase → Aawak Details.
 */
const TransporterTransactions = () => {
  const navigate = useNavigate();
  const [lifts, setLifts] = useState([]);
  const [transporters, setTransporters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('transporters');
  const [imsProduct, setImsProduct] = useState(null);

  const [transporterFilter, setTransporterFilter] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [search, setSearch] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [deliveries, transporterList, movedOut] = await Promise.all([
        getAawakDeliveries(), getAllTransporters(), getLiftsMovedOutOfTransporterGodown(),
      ]);
      setTransporters(transporterList || []);
      setLifts((deliveries || [])
        .filter(d => d.transporter_id && d.purchase_indent_items?.purchase_indents?.is_void !== true)
        .map(d => {
          const item = d.purchase_indent_items || {};
          const product = item.products || {};
          const destinations = (d.purchase_delivery_godowns || []).map(g => g.godowns?.name).filter(Boolean);
          const liftNo = d.lifting_number || '';
          return {
            id: d.delivery_id,
            liftNo: liftNo || '—',
            liftDate: d.delivery_date,
            receivingDate: d.receiving_date || null,
            transporterId: d.transporter_id,
            transporterName: d.transporters?.name || 'Unknown Transporter',
            vehicle: d.vehicle_number || d.transporters?.vehicle_number || '—',
            lrNo: d.lr_number || '—',
            indentNo: item.purchase_indents?.indent_number || '—',
            vendor: item.item_vendor?.name || '—',
            productId: item.product_id,
            productName: product.name || 'Unknown Product',
            unit: (product.unit || '').toUpperCase(),
            qty: Number(d.received_quantity) || 0,
            stage: getStage(d.status, liftNo, movedOut),
            destination: destinations.join(', ') || '—',
          };
        }));
    } catch (err) {
      console.error(err);
      toast.error('Failed to load transporter transactions');
    }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return lifts.filter(l => {
      if (transporterFilter && l.transporterId !== transporterFilter) return false;
      if (productFilter && String(l.productId) !== productFilter) return false;
      if (stageFilter && l.stage !== stageFilter) return false;
      const d = String(l.liftDate || '').slice(0, 10);
      if (fromDate && d < fromDate) return false;
      if (toDate && d > toDate) return false;
      if (!term) return true;
      return [l.liftNo, l.transporterName, l.productName, l.lrNo, l.vehicle, l.indentNo, l.vendor]
        .some(v => String(v).toLowerCase().includes(term));
    });
  }, [lifts, transporterFilter, productFilter, stageFilter, fromDate, toDate, search]);

  const totals = useMemo(() => filtered.reduce(addLift, EMPTY()), [filtered]);

  const groupBy = (keyOf, base) => {
    const map = new Map();
    filtered.forEach(l => {
      const key = keyOf(l);
      if (!map.has(key)) map.set(key, { key, ...base(l), ...EMPTY() });
      addLift(map.get(key), l);
    });
    return [...map.values()];
  };

  const transporterRows = useMemo(() => groupBy(
    l => l.transporterId,
    l => ({ transporterId: l.transporterId, transporterName: l.transporterName }),
  ).sort((a, b) => a.transporterName.localeCompare(b.transporterName)),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [filtered]);

  const productRows = useMemo(() => groupBy(
    l => `${l.transporterId}|${l.productId}`,
    l => ({ transporterId: l.transporterId, transporterName: l.transporterName, productId: l.productId, productName: l.productName, unit: l.unit }),
  ).sort((a, b) => a.transporterName.localeCompare(b.transporterName) || a.productName.localeCompare(b.productName)),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [filtered]);

  const sortedLifts = useMemo(() => [...filtered].sort((a, b) =>
    String(b.liftDate || '').localeCompare(String(a.liftDate || '')) || String(b.liftNo).localeCompare(String(a.liftNo), undefined, { numeric: true })),
  [filtered]);

  // Opens Purchase → Aawak Details on the matching sub-tab, searched.
  const openAawak = (sub, text) => {
    navigate(`/purchase?tab=aawak-details&sub=${sub}&q=${encodeURIComponent(text)}`);
  };

  const transporterOptions = useMemo(() => [
    { value: '', label: 'All Transporters' },
    ...transporters.map(t => ({ value: t.transporter_id, label: t.name })),
  ], [transporters]);

  const productOptions = useMemo(() => {
    const map = new Map();
    lifts.forEach(l => { if (l.productId) map.set(String(l.productId), l.productName); });
    return [{ value: '', label: 'All Products' }, ...[...map.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([value, label]) => ({ value, label }))];
  }, [lifts]);

  const stageOptions = [
    { value: '', label: 'All Status' },
    ...Object.entries(STAGES).map(([value, s]) => ({ value, label: s.label })),
  ];

  const hasFilters = transporterFilter || productFilter || stageFilter || fromDate || toDate || search;
  const clearFilters = () => {
    setTransporterFilter(''); setProductFilter(''); setStageFilter(''); setFromDate(''); setToDate(''); setSearch('');
  };

  const th = 'text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap';
  const td = 'px-3 py-2.5 text-center whitespace-nowrap';
  const num = (v, color) => (
    <span className={`tabular-nums font-semibold ${v ? color : 'text-slate-300'}`}>{v ? formatNum(v) : '—'}</span>
  );

  // Inward / Outward / Remaining columns for the transporter's godown.
  const tpHeaders = (
    <>
      <th className={`${th} !text-amber-700 bg-amber-50/60`}>TP Godown In</th>
      <th className={`${th} !text-amber-700 bg-amber-50/60`}>TP Godown Out</th>
      <th className={`${th} !text-amber-700 bg-amber-50/60`}>TP Godown Remaining</th>
    </>
  );
  const tpCells = (r, openRemaining) => (
    <>
      <td className={`${td} bg-amber-50/30`}>{num(r.tpIn, 'text-slate-800')}</td>
      <td className={`${td} bg-amber-50/30`}>{num(r.tpOut, 'text-emerald-600')}</td>
      <td className={`${td} bg-amber-50/30`}>
        {r.tpRemaining ? (
          <button type="button" onClick={openRemaining} title="Open in Aawak Details → Transporter Godown"
            className="inline-flex items-center gap-1 font-bold tabular-nums text-amber-700 hover:underline">
            {formatNum(r.tpRemaining)} <ExternalLink size={11} />
          </button>
        ) : num(0)}
      </td>
    </>
  );

  const SummaryCard = ({ icon: Icon, label, value, className, hint }) => (
    <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center gap-3 min-w-0">
      <div className={`p-2 rounded-lg bg-slate-50 ${className}`}><Icon size={18} /></div>
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
        <div className={`text-lg font-bold tabular-nums ${className}`}>{value}</div>
        {hint && <div className="text-[11px] text-slate-400">{hint}</div>}
      </div>
    </div>
  );

  const currentCount = tab === 'transporters' ? transporterRows.length : tab === 'products' ? productRows.length : sortedLifts.length;
  const countLabel = tab === 'transporters' ? 'transporter' : tab === 'products' ? 'product line' : 'lift';

  return (
    <div className="flex flex-col gap-4 pb-8 min-w-0 w-full max-w-full">
      {/* Header + filters */}
      <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex flex-col gap-3 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 p-2 rounded-lg"><Truck size={18} className="text-primary" /></div>
            <div>
              <h2 className="font-semibold text-slate-800 text-lg">Transporter Transactions</h2>
              <p className="text-xs text-slate-500">Purchase lifts by transporter — on the road, and In / Out / Remaining at each transporter's godown</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading} className="gap-1.5 h-9">
            <RotateCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64 shrink-0">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input placeholder="Search lift, LR, vehicle, product..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9 w-full" />
          </div>
          <Dropdown value={transporterFilter} onValueChange={setTransporterFilter} options={transporterOptions}
            placeholder="All Transporters" searchPlaceholder="Search transporters..." className="h-9 w-full sm:w-52 text-xs shrink-0" />
          <Dropdown value={productFilter} onValueChange={setProductFilter} options={productOptions}
            placeholder="All Products" searchPlaceholder="Search products..." className="h-9 w-full sm:w-52 text-xs shrink-0" />
          <Dropdown value={stageFilter} onValueChange={setStageFilter} options={stageOptions}
            placeholder="All Status" className="h-9 w-full sm:w-52 text-xs shrink-0" />
          <div className="flex items-center gap-1.5 text-xs text-slate-500 shrink-0">
            <span>From</span>
            <DatePicker value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-9 w-36 text-xs" />
            <span>To</span>
            <DatePicker value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-9 w-36 text-xs" />
          </div>
          {hasFilters && (
            <Button variant="outline" size="sm" onClick={clearFilters} className="h-9 gap-1 text-xs">
              <X size={13} /> Clear
            </Button>
          )}
        </div>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 min-w-0">
        <SummaryCard icon={Package} label="Total Lifted" value={formatNum(totals.lifted)} className="text-slate-800" hint={`${totals.lifts} lift${totals.lifts !== 1 ? 's' : ''}`} />
        <SummaryCard icon={Route} label="In Transit" value={formatNum(totals.transit)} className="text-violet-600" hint="Lifted, on the road" />
        <div className="bg-white rounded-xl border border-amber-200 px-4 py-3 flex items-center gap-3 min-w-0">
          <div className="p-2 rounded-lg bg-amber-50 text-amber-700"><Warehouse size={18} /></div>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Transporter Godown</div>
            <div className="flex items-center gap-1.5 text-sm font-bold tabular-nums flex-wrap">
              <span className="text-slate-800" title="Came in to transporter godowns">In {formatNum(totals.tpIn)}</span>
              <ArrowRight size={12} className="text-slate-400" />
              <span className="text-emerald-600" title="Moved on to our godowns">Out {formatNum(totals.tpOut)}</span>
              <ArrowRight size={12} className="text-slate-400" />
              <span className="text-amber-700" title="Still at transporter godowns">Remaining {formatNum(totals.tpRemaining)}</span>
            </div>
          </div>
        </div>
        <SummaryCard icon={CheckCircle2} label="Delivered" value={formatNum(totals.delivered)} className="text-emerald-600" hint="Arrived at our godowns" />
      </div>

      {/* Tables */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden min-w-0">
        <div className="px-4 py-2.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
            {TABS.map(t => (
              <button key={t.id} type="button" onClick={() => setTab(t.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${tab === t.id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {t.label}
              </button>
            ))}
          </div>
          <span className="text-xs font-medium text-slate-500">{currentCount} {countLabel}{currentCount !== 1 ? 's' : ''}</span>
        </div>

        {loading ? (
          <div className="p-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mx-auto mb-3"></div>
            <p className="text-sm text-slate-400">Loading transporter transactions...</p>
          </div>
        ) : currentCount === 0 ? (
          <div className="p-12 text-center">
            <Truck size={32} className="text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-400">{hasFilters ? 'No transactions match these filters.' : 'No transporter transactions yet.'}</p>
          </div>
        ) : tab === 'transporters' ? (
          <TableScrollSync scrollClassName="overflow-y-auto max-h-[65vh]">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10">
                <tr className="bg-blue-50 border-b border-slate-200">
                  <th className={th}>Transporter</th>
                  <th className={th}>Lifts</th>
                  <th className={th}>Total Lifted</th>
                  <th className={`${th} !text-violet-600`}>In Transit</th>
                  {tpHeaders}
                  <th className={`${th} !text-emerald-600`}>Delivered</th>
                  <th className={th}>Last Lift</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transporterRows.map(r => (
                  <tr key={r.key} className="hover:bg-slate-50">
                    <td className={`${td} font-semibold text-slate-800`}>
                      <button type="button" onClick={() => { setTransporterFilter(r.transporterId); setTab('products'); }}
                        title="Show this transporter's products" className="hover:underline text-primary">
                        {r.transporterName}
                      </button>
                    </td>
                    <td className={`${td} tabular-nums`}>{r.lifts}</td>
                    <td className={td}>{num(r.lifted, 'text-slate-900')}</td>
                    <td className={td}>{num(r.transit, 'text-violet-600')}</td>
                    {tpCells(r, () => openAawak('transporter-godown', r.transporterName))}
                    <td className={td}>{num(r.delivered, 'text-emerald-600')}</td>
                    <td className={`${td} text-slate-500`}>{formatDate(r.lastLift)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScrollSync>
        ) : tab === 'products' ? (
          <TableScrollSync scrollClassName="overflow-y-auto max-h-[65vh]">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10">
                <tr className="bg-blue-50 border-b border-slate-200">
                  <th className={th}>Transporter</th>
                  <th className={th}>Product Name</th>
                  <th className={th}>IMS</th>
                  <th className={th}>Unit</th>
                  <th className={th}>Lifts</th>
                  <th className={th}>Total Lifted</th>
                  <th className={`${th} !text-violet-600`}>In Transit</th>
                  {tpHeaders}
                  <th className={`${th} !text-emerald-600`}>Delivered</th>
                  <th className={th}>Last Lift</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {productRows.map(r => (
                  <tr key={r.key} className="hover:bg-slate-50">
                    <td className={`${td} font-medium text-slate-800`}>{r.transporterName}</td>
                    <td className={`${td} text-slate-700`}>{r.productName}</td>
                    <td className={td}>{r.productId ? <ImsButton onClick={() => setImsProduct({ productId: r.productId, productName: r.productName })} /> : '—'}</td>
                    <td className={td}><span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded font-medium">{r.unit || '—'}</span></td>
                    <td className={`${td} tabular-nums`}>{r.lifts}</td>
                    <td className={td}>{num(r.lifted, 'text-slate-900')}</td>
                    <td className={td}>{num(r.transit, 'text-violet-600')}</td>
                    {tpCells(r, () => openAawak('transporter-godown', r.productName))}
                    <td className={td}>{num(r.delivered, 'text-emerald-600')}</td>
                    <td className={`${td} text-slate-500`}>{formatDate(r.lastLift)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScrollSync>
        ) : (
          <TableScrollSync scrollClassName="overflow-y-auto max-h-[65vh]">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10">
                <tr className="bg-blue-50 border-b border-slate-200">
                  <th className={th}>Lifting No.</th>
                  <th className={th}>Lift Date</th>
                  <th className={th}>Transporter</th>
                  <th className={th}>Vehicle No.</th>
                  <th className={th}>LR No.</th>
                  <th className={th}>Indent No.</th>
                  <th className={th}>Vendor</th>
                  <th className={th}>Product Name</th>
                  <th className={th}>IMS</th>
                  <th className={th}>Qty</th>
                  <th className={th}>Status</th>
                  <th className={th}>Destination Godown</th>
                  <th className={th}>Receiving Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedLifts.map(l => (
                  <tr key={l.id} className="hover:bg-slate-50">
                    <td className={td}>
                      {l.liftNo !== '—' ? (
                        <button type="button" onClick={() => openAawak(STAGES[l.stage].aawakSub, l.liftNo)}
                          title="Open this lift in Aawak Details"
                          className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
                          {l.liftNo} <ExternalLink size={11} />
                        </button>
                      ) : '—'}
                    </td>
                    <td className={`${td} text-slate-600`}>{formatDate(l.liftDate)}</td>
                    <td className={`${td} font-medium text-slate-800`}>{l.transporterName}</td>
                    <td className={`${td} text-slate-600`}>{l.vehicle}</td>
                    <td className={`${td} text-slate-600`}>{l.lrNo}</td>
                    <td className={`${td} text-slate-600`}>{l.indentNo}</td>
                    <td className={`${td} text-slate-600`}>{l.vendor}</td>
                    <td className={`${td} text-slate-700`}>{l.productName}</td>
                    <td className={td}>{l.productId ? <ImsButton onClick={() => setImsProduct({ productId: l.productId, productName: l.productName })} /> : '—'}</td>
                    <td className={`${td} tabular-nums font-semibold text-slate-900`}>{formatNum(l.qty)} <span className="text-[10px] text-slate-400 font-medium">{l.unit}</span></td>
                    <td className={td}>
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium border ${STAGES[l.stage].pill}`}>{STAGES[l.stage].label}</span>
                    </td>
                    <td className={`${td} text-slate-600`}>{l.destination}</td>
                    <td className={`${td} text-slate-500`}>{l.stage === 'viaTpt' || l.stage === 'direct' ? formatDate(l.receivingDate) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScrollSync>
        )}
        {!loading && currentCount > 0 && tab !== 'lifts' && (
          <p className="px-4 py-2 text-[11px] text-slate-400 border-t border-slate-100">
            TP Godown In = came in to the transporter's godown · Out = moved on to our godowns · Remaining = still there (click to open in Aawak Details).
          </p>
        )}
      </div>

      <ProductImsModal product={imsProduct} onClose={() => setImsProduct(null)} />
    </div>
  );
};

export default TransporterTransactions;
