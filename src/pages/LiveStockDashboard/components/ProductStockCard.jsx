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
    <td className="px-4 py-3 text-right font-semibold text-slate-900 tabular-nums">{formatNum(p.totals.current)}</td>
  </tr>
);

export default ProductStockCard;
