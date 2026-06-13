const formatNum = (n) => Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const ProductStockCard = ({ product: p }) => (
  <tr className="hover:bg-slate-50">
    <td className="px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="font-medium text-slate-800">{p.productName}</span>
        <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded">{p.unit}</span>
      </div>
    </td>
    <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{formatNum(p.totals.opening)}</td>
    <td className="px-4 py-3 text-right text-green-600 tabular-nums">+{formatNum(p.totals.stockIn)}</td>
    <td className="px-4 py-3 text-right text-red-500 tabular-nums">-{formatNum(p.totals.stockOut)}</td>
    <td className="px-4 py-3 text-right font-semibold text-primary tabular-nums">{formatNum(p.totals.closing)}</td>
    <td className="px-4 py-3 text-right tabular-nums">
      {p.godowns
        .filter((g) => g.current !== 0)
        .sort((a, b) => b.current - a.current)
        .map((g) => (
          <div key={g.godownId} className="flex items-center justify-between gap-3 text-xs leading-5">
            <span className="text-slate-500 truncate max-w-[100px]">{g.godownName}</span>
            <span className="font-semibold text-slate-900">{formatNum(g.current)}</span>
          </div>
        ))}
      {p.godowns.every((g) => g.current === 0) && (
        <span className="text-xs text-slate-400">No stock</span>
      )}
    </td>
  </tr>
);

export default ProductStockCard;
