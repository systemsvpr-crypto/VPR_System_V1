import { Warehouse } from 'lucide-react';

const formatNum = (n) => Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const GodownSummaryTable = ({ godowns, totals }) => (
  <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
    <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
      <div className="bg-primary/10 p-2 rounded-lg">
        <Warehouse size={18} className="text-primary" />
      </div>
      <h3 className="font-semibold text-slate-800">Godown Summary</h3>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Godown</th>
            <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Opening</th>
            <th className="text-right px-4 py-3 text-xs font-semibold text-green-600 uppercase tracking-wider">Stock In</th>
            <th className="text-right px-4 py-3 text-xs font-semibold text-red-500 uppercase tracking-wider">Stock Out</th>
            <th className="text-right px-4 py-3 text-xs font-semibold text-primary uppercase tracking-wider">Closing</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {godowns.map((g) => (
            <tr key={g.godownId} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-medium text-slate-700">{g.godownName}</td>
              <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{formatNum(g.opening)}</td>
              <td className="px-4 py-3 text-right text-green-600 tabular-nums">+{formatNum(g.stockIn)}</td>
              <td className="px-4 py-3 text-right text-red-500 tabular-nums">-{formatNum(g.stockOut)}</td>
              <td className="px-4 py-3 text-right font-semibold text-primary tabular-nums">{formatNum(g.closing)}</td>
            </tr>
          ))}
          <tr className="bg-slate-50 font-semibold">
            <td className="px-4 py-3 text-slate-800">Total</td>
            <td className="px-4 py-3 text-right text-slate-800 tabular-nums">{formatNum(totals.opening)}</td>
            <td className="px-4 py-3 text-right text-green-700 tabular-nums">+{formatNum(totals.stockIn)}</td>
            <td className="px-4 py-3 text-right text-red-600 tabular-nums">-{formatNum(totals.stockOut)}</td>
            <td className="px-4 py-3 text-right text-primary font-bold tabular-nums">{formatNum(totals.closing)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
);

export default GodownSummaryTable;
