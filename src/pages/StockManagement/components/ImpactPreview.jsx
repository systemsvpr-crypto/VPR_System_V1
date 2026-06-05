import { Loader2, AlertTriangle, ArrowRight, XCircle } from 'lucide-react';

const txnTypeLabel = (type) => {
  const map = {
    OPEN_STOCK: 'Opening',
    IN_FACTORY: 'Added',
    TRANSFER_IN: 'Received',
    TRANSFER_OUT: 'Sent',
    OUT_GODOWN: 'Dispatch',
    ADJUSTMENT_IN: 'Adj +',
    ADJUSTMENT_OUT: 'Adj -',
  };
  return map[type] || type.replace(/_/g, ' ');
};

const isInType = (type) => ['OPEN_STOCK','IN_FACTORY','TRANSFER_IN','ADJUSTMENT_IN'].includes(type);

const VoidedEntry = ({ txn, impact }) => {
  const qty = Number(txn.qty || 0);
  const voidedContrib = isInType(txn.txn_type) ? qty : -qty;
  const lastRow = impact.rows?.[impact.rows.length - 1];
  const afterVoid = lastRow?.simulatedBalance ?? impact.anchorBalance;
  const currentStock = afterVoid + voidedContrib;
  const effect = afterVoid - currentStock;

  return (
    <div className="px-4 py-3 bg-red-50/60 border-b border-red-100">
      <div className="flex items-center gap-2 mb-2">
        <XCircle size={14} className="text-red-500" />
        <span className="text-xs font-semibold text-red-700">Transaction being removed</span>
      </div>
      <div className="grid grid-cols-4 gap-2 items-center text-xs mb-3">
        <span className="text-red-600">{txn.txn_date}</span>
        <span>
          <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-medium">
            {txnTypeLabel(txn.txn_type)}
          </span>
        </span>
        <span className="text-right font-medium text-red-600 tabular-nums">
          {isInType(txn.txn_type) ? '+' : '-'}{qty.toFixed(0)}
        </span>
        <span className="text-right text-red-400 text-[10px] uppercase tracking-wider font-semibold">
          Will be removed
        </span>
      </div>
      <div className="bg-white rounded-lg border border-red-200 p-3 space-y-1.5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-600 font-medium">Current stock (with this entry)</span>
          <span className="text-lg font-bold text-slate-900 tabular-nums">{currentStock.toFixed(0)}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-600 font-medium">Stock after void</span>
          <span className="text-lg font-bold text-slate-900 tabular-nums">{afterVoid.toFixed(0)}</span>
        </div>
        <div className="border-t border-slate-100 pt-1.5 flex items-center justify-between text-sm">
          <span className="text-slate-500 text-xs">Effect on stock</span>
          <span className={`text-sm font-bold tabular-nums ${
            effect < 0 ? 'text-red-600' : effect > 0 ? 'text-emerald-600' : 'text-slate-500'
          }`}>
            {effect > 0 ? '+' : ''}{effect.toFixed(0)}
          </span>
        </div>
      </div>
    </div>
  );
};

const ImpactPreview = ({ loading, error, data, productName, deletedTransaction }) => {
  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex items-center justify-center gap-2">
        <Loader2 size={16} className="animate-spin text-slate-400" />
        <span className="text-sm text-slate-500">Checking impact...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white border border-red-200 rounded-xl p-6">
        <div className="flex items-center gap-2 text-sm text-red-600">
          <AlertTriangle size={16} />
          <span>Failed to calculate impact. The transaction may have inconsistent data. Try refreshing or contact support.</span>
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) return null;

  const anyFailingRows = data.some(d => d.rows.some(r => r.wouldFail));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="text-sm font-semibold text-slate-800">Effect on Stock</div>
        {productName && (
          <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded">{productName}</span>
        )}
      </div>

      {data.map((impact, idx) => {
        const qty = Number(deletedTransaction?.qty || 0);
        const voidedContrib = deletedTransaction ? (isInType(deletedTransaction.txn_type) ? qty : -qty) : 0;
        const lastRow = impact.rows?.[impact.rows.length - 1];
        const afterVoid = lastRow?.simulatedBalance ?? impact.anchorBalance;
        const currentStock = afterVoid + voidedContrib;
        const netChange = impact.rows.length > 0
          ? impact.rows[impact.rows.length - 1].simulatedBalance - impact.anchorBalance
          : 0;

        return (
          <div key={idx} className={`rounded-xl border overflow-hidden ${anyFailingRows ? 'border-red-200' : 'border-slate-200'}`}>
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-700">{impact.godownName || 'Godown'}</span>
              </div>
              <div className="flex items-center gap-3 text-xs">
                {deletedTransaction ? (
                  <>
                    <span className="text-slate-500">
                      Current stock: <span className="font-semibold text-slate-700">{currentStock.toFixed(0)}</span>
                    </span>
                    <ArrowRight size={12} className="text-slate-300" />
                    <span className="text-slate-500">
                      After void: <span className="font-semibold text-slate-700">{afterVoid.toFixed(0)}</span>
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-slate-500">
                      Stock before edit: <span className="font-semibold text-slate-700">{impact.anchorBalance.toFixed(0)}</span>
                    </span>
                    <ArrowRight size={12} className="text-slate-300" />
                    <span className="text-slate-500">
                      After: <span className="font-semibold text-slate-700">
                        {impact.rows.length > 0
                          ? impact.rows[impact.rows.length - 1].simulatedBalance.toFixed(0)
                          : impact.anchorBalance.toFixed(0)}
                      </span>
                    </span>
                  </>
                )}
                <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                  netChange > 0 ? 'bg-emerald-50 text-emerald-700' :
                  netChange < 0 ? 'bg-red-50 text-red-700' :
                  'bg-slate-100 text-slate-500'
                }`}>
                  {netChange > 0 ? '+' : ''}{netChange.toFixed(0)}
                </span>
              </div>
            </div>

            {deletedTransaction && <VoidedEntry txn={deletedTransaction} impact={impact} />}

            {impact.rows.length === 0 ? (
              <div className="px-4 py-4 text-center text-sm text-slate-400 bg-white">
                No other entries affected
              </div>
            ) : (
              <div className="bg-white">
                <div className="grid grid-cols-4 gap-2 px-4 py-1.5 border-b border-slate-50 text-xs text-slate-400">
                  <span>Date</span>
                  <span>Type</span>
                  <span className="text-right">Qty</span>
                  <span className="text-right">Running Balance</span>
                </div>
                {impact.rows.map((row, ri) => {
                  const isEdited = row.txn_id?.startsWith('new-');
                  return (
                  <div key={row.txn_id || ri} className={`px-4 py-2 border-b border-slate-50 ${row.wouldFail ? 'bg-red-50' : isEdited ? 'bg-primary/[0.03] border-l-2 border-primary' : ri % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                    <div className="grid grid-cols-4 gap-2 items-center">
                      <span className="text-xs text-slate-700">{row.txn_date}</span>
                      <span className="text-xs">
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                          isInType(row.txn_type)
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-red-50 text-red-700'
                        }`}>
                          {txnTypeLabel(row.txn_type)}
                        </span>
                      </span>
                      <span className={`text-xs font-medium text-right tabular-nums ${
                        row.contribution >= 0 ? 'text-emerald-600' : 'text-red-500'
                      }`}>
                        {row.contribution >= 0 ? '+' : ''}{row.qty.toFixed(0)}
                      </span>
                      <span className={`text-xs font-semibold text-right tabular-nums flex items-center justify-end gap-1 ${
                        row.wouldFail ? 'text-red-700' : 'text-slate-700'
                      }`}>
                        {row.simulatedBalance.toFixed(0)}
                        {row.wouldFail && <AlertTriangle size={12} className="text-red-500 shrink-0" />}
                      </span>
                    </div>
                    {row.wouldFail && (
                      <div className="mt-1 text-xs text-red-600 flex items-center gap-1">
                        <AlertTriangle size={10} />
                        Balance would drop below zero
                      </div>
                    )}
                  </div>
                );
              })}
              </div>
            )}
          </div>
        );
      })}

      <div className={`px-4 py-2.5 rounded-lg border text-xs flex items-center gap-1.5 ${
        anyFailingRows
          ? 'bg-red-50 border-red-200 text-red-700'
          : 'bg-emerald-50 border-emerald-200 text-emerald-700'
      }`}>
        {anyFailingRows ? (
          <AlertTriangle size={12} />
        ) : (
          <span className="text-emerald-500 font-bold">&#10003;</span>
        )}
        <span>
          {anyFailingRows
            ? 'This change will make stock go negative. Fix the highlighted entries first.'
            : 'This change is safe — all entries will have sufficient stock.'}
        </span>
      </div>
    </div>
  );
};

export default ImpactPreview;
