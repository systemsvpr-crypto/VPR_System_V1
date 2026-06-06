import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Tag } from 'lucide-react';
import { format } from 'date-fns';
import { PAGES } from '../../constants';
import { getAllProducts, getProductStockByDate } from '../../services/masterService';
import { getAllGroups } from '../../services/productGroupingService';
import { DatePicker } from '../../components/ui/date-picker';


const StockList = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [godowns, setGodowns] = useState([]);
  const [balanceMap, setBalanceMap] = useState({});
  const [groups, setGroups] = useState([]);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
    loadProducts();
    loadGroups();
  }, [selectedDate]);

  const loadData = async () => {
    setLoading(true);
    try {
      const stkData = await getProductStockByDate(selectedDate);
      setGodowns(stkData.godowns);
      setBalanceMap(stkData.balanceMap);
    } catch (err) {
      console.error('Failed to load data', err);
    }
    setLoading(false);
  };

  const loadProducts = async () => {
    try {
      const data = await getAllProducts();
      setProducts(data);
    } catch (err) {
      console.error('Failed to load products', err);
    }
  };

  const loadGroups = async () => {
    try {
      const data = await getAllGroups();
      setGroups(data);
    } catch (err) {
      console.error('Failed to load groups', err);
    }
  };

  const sortedGroups = useMemo(() => {
    return [...groups].sort((a, b) => a.group_name.localeCompare(b.group_name));
  }, [groups]);

  const groupProductIds = useMemo(() => {
    const map = {};
    for (const g of groups) {
      map[g.group_id] = new Set((g.members || []).map(m => m.product_id));
    }
    return map;
  }, [groups]);

  const groupedProductIds = useMemo(() => {
    const ids = new Set();
    for (const g of groups) {
      for (const m of g.members || []) {
        ids.add(m.product_id);
      }
    }
    return ids;
  }, [groups]);

  const productTypes = useMemo(() => {
    const types = new Set();
    for (const p of products) {
      if (p.product_type && groupedProductIds.has(p.product_id)) types.add(p.product_type);
    }
    return [...types].sort((a, b) => a.localeCompare(b));
  }, [products, groupedProductIds]);

  const productsByType = useMemo(() => {
    const map = {};
    for (const p of products) {
      if (!p.product_type || !groupedProductIds.has(p.product_id)) continue;
      if (!map[p.product_type]) map[p.product_type] = [];
      map[p.product_type].push(p);
    }
    for (const type of Object.keys(map)) {
      map[type].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }
    return map;
  }, [products, groupedProductIds]);

  const flatProducts = useMemo(() => {
    const result = [];
    for (const type of productTypes) {
      for (const p of productsByType[type] || []) {
        result.push(p);
      }
    }
    return result;
  }, [productTypes, productsByType]);

  const groupGodowns = useMemo(() => {
    const result = {};
    for (const g of groups) {
      const productIds = groupProductIds[g.group_id];
      if (!productIds || productIds.size === 0) continue;
      const godownSet = new Set();
      for (const pid of productIds) {
        for (const gd of godowns) {
          const stock = balanceMap[`${pid}|${gd.godown_id}`];
          if (stock && stock > 0) godownSet.add(gd.godown_id);
        }
      }
      result[g.group_id] = godownSet;
    }
    return result;
  }, [groups, groupProductIds, godowns, balanceMap]);

  const stockMatrix = useMemo(() => {
    const matrix = {};
    for (const g of groups) {
      matrix[g.group_id] = {};
      const relevantGodowns = groupGodowns[g.group_id];
      if (!relevantGodowns || relevantGodowns.size === 0) {
        for (const p of flatProducts) {
          matrix[g.group_id][p.product_id] = 0;
        }
        continue;
      }
      for (const p of flatProducts) {
        let total = 0;
        for (const gId of relevantGodowns) {
          total += balanceMap[`${p.product_id}|${gId}`] ?? 0;
        }
        matrix[g.group_id][p.product_id] = total;
      }
    }
    return matrix;
  }, [groups, flatProducts, groupGodowns, balanceMap]);

  const totals = useMemo(() => {
    const rowTotals = {};
    const colTotals = {};
    let grandTotal = 0;

    for (const g of groups) {
      rowTotals[g.group_id] = 0;
      for (const p of flatProducts) {
        const val = stockMatrix[g.group_id]?.[p.product_id] ?? 0;
        rowTotals[g.group_id] += val;
        colTotals[p.product_id] = (colTotals[p.product_id] || 0) + val;
      }
      grandTotal += rowTotals[g.group_id];
    }

    return { rowTotals, colTotals, grandTotal };
  }, [groups, flatProducts, stockMatrix]);

  const handleBack = () => {
    if (window.history.length > 2) {
      navigate(-1);
    } else {
      navigate(`/${PAGES[0].id}`, { replace: true });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
          <button onClick={handleBack} className="p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold text-slate-900">Stock List</h1>
        </div>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
        <button
          onClick={handleBack}
          className="p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-semibold text-slate-900">Stock List</h1>
        <div className="ml-auto flex items-center gap-3">

          <div className="w-44">
            <DatePicker
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              placeholder="Select date"
            />
          </div>
        </div>
      </div>

      <div className="p-6">
        {sortedGroups.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4 border border-slate-100">
              <Tag size={32} className="text-slate-300" />
            </div>
            <h3 className="text-base font-semibold text-slate-600 mb-1">No Product Groups</h3>
            <p className="text-sm text-slate-400">Create Product Groups in Master and assign products to see stock here.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th rowSpan={2} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider min-w-[160px]">
                      Product Group Name
                    </th>
                    {productTypes.map(type => (
                      <th
                        key={type}
                        colSpan={productsByType[type]?.length || 0}
                        className="text-left px-3 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider border-r border-slate-200 last:border-r-0"
                      >
                        {type}
                      </th>
                    ))}
                    <th rowSpan={2} className="text-right px-4 py-3 text-xs font-semibold text-slate-700 uppercase tracking-wider min-w-[80px] bg-slate-100">
                      Total
                    </th>
                  </tr>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    {flatProducts.map(p => (
                      <th
                        key={p.product_id}
                        className="text-right px-3 py-3 text-xs font-medium text-slate-500 whitespace-nowrap min-w-[100px]"
                      >
                        <div className="flex flex-col items-end">
                          <span>{p.name}</span>
                          {p.unit && <span className="text-[10px] text-slate-400 uppercase">{p.unit}</span>}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedGroups.map(g => (
                    <tr key={g.group_id} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Tag size={14} className="text-slate-400 shrink-0" />
                          <span className="text-sm font-medium text-slate-700">{g.group_name}</span>
                        </div>
                      </td>
                      {flatProducts.map(p => {
                        const val = stockMatrix[g.group_id]?.[p.product_id] ?? 0;
                        return (
                          <td
                            key={p.product_id}
                            className={`px-3 py-3 text-right tabular-nums text-sm ${
                              val > 0 ? 'text-slate-700' : 'text-slate-300'
                            }`}
                          >
                            {val}
                          </td>
                        );
                      })}
                      <td className="px-4 py-3 text-right tabular-nums text-sm font-semibold text-slate-800 bg-slate-50/80">
                        {totals.rowTotals[g.group_id] ?? 0}
                      </td>
                    </tr>
                  ))}
                </tbody>

              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default StockList;
