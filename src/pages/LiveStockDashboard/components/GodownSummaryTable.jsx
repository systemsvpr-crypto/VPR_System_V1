const formatNum = (n) => Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const GodownSummaryTable = ({ godowns, totals }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-xs">
      <thead>
        <tr className="bg-slate-50 border-b border-slate-200">
          <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Godown</th>
          <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Type</th>
          <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Opening</th>
          <th className="text-center px-4 py-3 text-xs font-semibold text-green-600 uppercase tracking-wider">Stock In</th>
          <th className="text-center px-4 py-3 text-xs font-semibold text-red-500 uppercase tracking-wider">Stock Out</th>
          <th className="text-center px-4 py-3 text-xs font-semibold text-primary uppercase tracking-wider">Closing</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {godowns.map((g) => (
          <tr key={g.godownId} className="hover:bg-slate-50">
            <td className="px-4 py-3 font-medium text-slate-700 text-center">{g.godownName}</td>
            <td className="px-4 py-3 text-center">
              {g.godownType && (
                <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">{g.godownType}</span>
              )}
            </td>
            <td className="px-4 py-3 text-center text-slate-600 tabular-nums">{formatNum(g.opening)}</td>
            <td className="px-4 py-3 text-center text-green-600 tabular-nums">+{formatNum(g.stockIn)}</td>
            <td className="px-4 py-3 text-center text-red-500 tabular-nums">-{formatNum(g.stockOut)}</td>
            <td className="px-4 py-3 text-center font-semibold text-primary tabular-nums">{formatNum(g.closing)}</td>
          </tr>
        ))}
        <tr className="bg-slate-50 font-semibold">
          <td className="px-4 py-3 text-slate-800 text-center">Total</td>
          <td className="px-4 py-3 text-center"></td>
          <td className="px-4 py-3 text-center text-slate-800 tabular-nums">{formatNum(totals.opening)}</td>
          <td className="px-4 py-3 text-center text-green-700 tabular-nums">+{formatNum(totals.stockIn)}</td>
          <td className="px-4 py-3 text-center text-red-600 tabular-nums">-{formatNum(totals.stockOut)}</td>
          <td className="px-4 py-3 text-center text-primary font-bold tabular-nums">{formatNum(totals.closing)}</td>
        </tr>
      </tbody>
    </table>
  </div>
);

export default GodownSummaryTable;
