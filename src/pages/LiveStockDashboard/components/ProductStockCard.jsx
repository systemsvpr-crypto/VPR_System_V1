const formatNum = (n) => Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const ProductStockCard = ({ product: p }) => (
  <tr className="hover:bg-slate-50 text-xs">
    <td className="px-4 py-3 text-center">
      <span className="font-medium text-slate-800">{p.productName}</span>
    </td>
    <td className="px-4 py-3 text-center">
      {p.unit ? (
        <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded uppercase font-medium">{p.unit}</span>
      ) : (
        <span className="text-slate-300">—</span>
      )}
    </td>
    <td className="px-4 py-3 text-center text-slate-600 tabular-nums">{formatNum(p.totals.opening)}</td>
    <td className="px-4 py-3 text-center text-green-600 tabular-nums">+{formatNum(p.totals.stockIn)}</td>
    <td className="px-4 py-3 text-center text-red-500 tabular-nums">-{formatNum(p.totals.stockOut)}</td>
    <td className="px-4 py-3 text-center font-semibold text-primary tabular-nums">{formatNum(p.totals.closing)}</td>
    <td className="px-4 py-3 text-center tabular-nums">
      {p.godowns
        .filter((g) => g.current !== 0)
        .sort((a, b) => b.current - a.current)
        .map((g) => {
          const isTransport = g.godownType === 'Transporter';
          return (
            <div key={g.godownId} className="flex items-center justify-center gap-3 text-xs leading-5">
              <span className={`truncate max-w-[100px] ${isTransport ? 'text-amber-600' : 'text-slate-500'}`}>{g.godownName}</span>
              <span className={`font-semibold ${isTransport ? 'text-amber-600' : 'text-slate-900'}`}>{formatNum(g.current)}</span>
            </div>
          );
        })}
      {(p.totals?.current === 0 || !p.totals?.current) && (
        <span className="text-xs text-slate-400">No stock</span>
      )}
    </td>
  </tr>
);

export default ProductStockCard;
