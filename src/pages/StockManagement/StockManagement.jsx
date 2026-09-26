import { useState, useEffect, useMemo } from 'react';
import { Factory, ArrowLeftRight, Truck, Package, Warehouse, Download, PackagePlus, Search, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import useAuthStore from '../../store/authStore';
import { getAllProducts, getAllGodowns, getAllProductStock } from '../../services/masterService';
import { getAllTransactions, deleteTransactionRow } from '../../services/stockService';
import Pagination from '@/components/ui/pagination';
import { Input } from '@/components/ui/input';
import { formatQty } from '@/lib/qty';

const GODOWN_COLORS = [
  { badge: 'bg-blue-50 text-blue-600 border-blue-100' },
  { badge: 'bg-emerald-50 text-emerald-600 border-emerald-100' },
  { badge: 'bg-purple-50 text-purple-600 border-purple-100' },
  { badge: 'bg-orange-50 text-orange-600 border-orange-100' },
  { badge: 'bg-rose-50 text-rose-600 border-rose-100' },
  { badge: 'bg-cyan-50 text-cyan-600 border-cyan-100' },
  { badge: 'bg-amber-50 text-amber-600 border-amber-100' },
  { badge: 'bg-teal-50 text-teal-600 border-teal-100' },
  { badge: 'bg-indigo-50 text-indigo-600 border-indigo-100' },
  { badge: 'bg-pink-50 text-pink-600 border-pink-100' },
];
import FactoryInModal from './components/FactoryInModal';
import TransferModal from './components/TransferModal';
import DispatchModal from './components/DispatchModal';
import BulkDispatchModal from './components/BulkDispatchModal';
import DeleteConfirmModal from './components/DeleteConfirmModal';
import { TransactionFilters, TransactionTable } from './components/TransactionTable';

const ACTIONS = [
  { id: 'factory-in', label: 'Godown in', icon: Factory, color: 'bg-blue-50 text-blue-600 border-blue-200' },
  { id: 'production', label: 'Production', icon: PackagePlus, color: 'bg-indigo-50 text-indigo-600 border-indigo-200' },
  { id: 'transfer', label: 'Transfer Stock', icon: ArrowLeftRight, color: 'bg-amber-50 text-amber-600 border-amber-200' },
  { id: 'dispatch', label: 'Dispatch Out', icon: Truck, color: 'bg-rose-50 text-rose-600 border-rose-200' },
];


const StockManagement = () => {
  const { user } = useAuthStore();
  const [activeModal, setActiveModal] = useState(null);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [products, setProducts] = useState([]);
  const [godowns, setGodowns] = useState([]);
  const [productStockMap, setProductStockMap] = useState({});
  const [transactions, setTransactions] = useState([]);
  const [txnLoading, setTxnLoading] = useState(true);
  const [deletingTransaction, setDeletingTransaction] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [filters, setFilters] = useState({ product_id: '', godown_id: '', txn_type: '', from_date: '', to_date: '' });
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    setCurrentPage(1);
  }, [filters, searchTerm]);

  useEffect(() => {
    Promise.all([getAllProducts(), getAllGodowns(), getAllProductStock()])
      .then(([p, g, stockRows]) => {
        setProducts(p);
        setGodowns(g);
        const godownNameMap = Object.fromEntries(g.map(gd => [gd.godown_id, gd.name]));
        const godownColorMap = Object.fromEntries(g.map((gd, i) => [gd.godown_id, GODOWN_COLORS[i % GODOWN_COLORS.length]]));
        const map = {};
        for (const row of stockRows) {
          if (!map[row.product_id]) map[row.product_id] = [];
          map[row.product_id].push({
            godownName: godownNameMap[row.godown_id] || 'Unknown',
            godownId: row.godown_id,
            qty: row.current_stock,
            badge: godownColorMap[row.godown_id]?.badge || 'bg-slate-100 text-slate-700 border-slate-200',
          });
        }
        setProductStockMap(map);
      })
      .catch(() => toast.error('Failed to load masters'));
    fetchTransactions();
  }, []);

  useEffect(() => { setCurrentPage(1); }, [filters]);

  const fetchTransactions = async (f = filters) => {
    setTxnLoading(true);
    try {
      const data = await getAllTransactions(f);
      setTransactions(data);
    } catch (err) { toast.error('Failed to load transactions'); }
    setTxnLoading(false);
  };

  // productStockMap (the "Current stock" / "Available at source" figures
  // shown inline in every modal's Product/Grouping picker) was only ever
  // fetched once, on mount — after Godown In/Production/Transfer/Dispatch/
  // Delete actually changed stock, the transaction list refreshed but this
  // never did, so those pickers kept showing stale, page-load-time qty per
  // godown instead of the live figure. Re-fetches godown_stock and rebuilds
  // the map against the (already-loaded) godowns list.
  const refreshProductStock = async () => {
    try {
      const stockRows = await getAllProductStock();
      const godownNameMap = Object.fromEntries(godowns.map(gd => [gd.godown_id, gd.name]));
      const godownColorMap = Object.fromEntries(godowns.map((gd, i) => [gd.godown_id, GODOWN_COLORS[i % GODOWN_COLORS.length]]));
      const map = {};
      for (const row of stockRows) {
        if (!map[row.product_id]) map[row.product_id] = [];
        map[row.product_id].push({
          godownName: godownNameMap[row.godown_id] || 'Unknown',
          godownId: row.godown_id,
          qty: row.current_stock,
          badge: godownColorMap[row.godown_id]?.badge || 'bg-slate-100 text-slate-700 border-slate-200',
        });
      }
      setProductStockMap(map);
    } catch (err) {
      toast.error('Failed to refresh stock levels');
    }
  };

  const handleFilterChange = (key, value) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    fetchTransactions(newFilters);
  };

  const handleEdit = (txn) => {
    let editTxn = { ...txn, qty: String(Number(txn.qty)) };
    if (txn.pair_id) {
      const pair = transactions.find(t => t.pair_id === txn.pair_id && t.txn_id !== txn.txn_id);
      if (txn.txn_type === 'TRANSFER_OUT') {
        editTxn.from_godown_id = txn.godown_id;
        editTxn.to_godown_id = pair?.godown_id || '';
      } else {
        editTxn.from_godown_id = pair?.godown_id || '';
        editTxn.to_godown_id = txn.godown_id;
      }
      editTxn.pair = pair;
    }
    setEditingTransaction(editTxn);
    if (txn.txn_type === 'IN_FACTORY' || txn.txn_type === 'ADJUSTMENT_IN' || txn.txn_type === 'OPEN_STOCK' || txn.txn_type === 'PURCHASE_IN') setActiveModal('factory-in');
    else if (txn.txn_type === 'PRODUCTION_IN') setActiveModal('production');
    else if (txn.pair_id) setActiveModal('transfer');
    else if (txn.txn_type === 'OUT_GODOWN' || txn.txn_type === 'ADJUSTMENT_OUT') setActiveModal('dispatch');
  };

  const handleDeleteClick = (txn) => {
    setDeletingTransaction(txn);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingTransaction) return;
    setDeleteLoading(true);
    try {
      await deleteTransactionRow(deletingTransaction.txn_id);
      toast.success('Transaction deleted successfully');
      setDeletingTransaction(null);
      fetchTransactions();
      refreshProductStock();
    } catch (err) { toast.error(err.message); }
    setDeleteLoading(false);
  };

  const handleCloseModal = () => {
    setActiveModal(null);
    setEditingTransaction(null);
  };

  const handleSuccess = () => { setActiveModal(null); setEditingTransaction(null); fetchTransactions(); refreshProductStock(); };

  const filteredTransactions = useMemo(() => {
    if (!searchTerm.trim()) return transactions;
    const term = searchTerm.trim().toLowerCase();
    return transactions.filter(t => {
      const productName = (t.products?.name || '').toLowerCase();
      const godownName = (t.godowns?.name || '').toLowerCase();
      const liftNum = (t.lifting_number || '').toLowerCase();
      const dispatchNum = (t.dispatch_number || '').toLowerCase();
      const lrNum = (t.lr_number || '').toLowerCase();
      const typeStr = (t.txn_type === 'IN_FACTORY' ? 'godown in' : t.txn_type || '').replace(/_/g, ' ').toLowerCase();
      const dateStr = (t.dispatch_plans?.dispatch_date || t.txn_date || '').toLowerCase();
      const qtyStr = String(t.qty || '');
      const notesStr = (t.notes || t.remarks || '').toLowerCase();

      return productName.includes(term) ||
        godownName.includes(term) ||
        liftNum.includes(term) ||
        dispatchNum.includes(term) ||
        lrNum.includes(term) ||
        typeStr.includes(term) ||
        dateStr.includes(term) ||
        qtyStr.includes(term) ||
        notesStr.includes(term);
    });
  }, [transactions, searchTerm]);

  // Exports every transaction matching current filters and search (not just the
  // current page) — same columns and Type/Lift-Dispatch/Qty-sign conventions
  // as the on-screen table, so the file reads exactly like what's shown.
  const IN_TYPES = ['OPEN_STOCK', 'IN_FACTORY', 'TRANSFER_IN', 'ADJUSTMENT_IN', 'PURCHASE_IN', 'PURCHASE_IN(TPT)'];
  const handleExport = () => {
    if (filteredTransactions.length === 0) {
      toast.error('No transactions to export.');
      return;
    }
    const rows = filteredTransactions.map(t => ({
      // OUT_GODOWN rows read as their planned Dispatch Date (from the linked
      // dispatch_plans row), not the capped txn_date — same as the on-screen
      // table (see displayDate in TransactionTable.jsx).
      'Date': t.dispatch_plans?.dispatch_date || t.txn_date,
      'Product Name': t.products?.name || '-',
      'Unit': t.products?.unit ? t.products.unit.toUpperCase() : '-',
      'Godown': t.godowns?.name || '-',
      'Type': t.txn_type === 'IN_FACTORY' ? 'GODOWN IN' : t.txn_type.replace(/_/g, ' '),
      'Lift/Dispatch #': t.txn_type === 'PURCHASE_IN' ? (t.lifting_number || '—') : (t.dispatch_number || t.lr_number || '—'),
      'Qty': `${IN_TYPES.includes(t.txn_type) ? '+' : '-'}${formatQty(t.qty)}`,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Transaction History');
    XLSX.writeFile(wb, `Transaction_History_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const totalTransactionPages = Math.max(1, Math.ceil(filteredTransactions.length / pageSize));
  const currentTransactions = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredTransactions.slice(start, start + pageSize);
  }, [filteredTransactions, currentPage, pageSize]);

  return (
    <div className="flex flex-col gap-6 shrink-0 pb-2">


      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 shrink-0">
        {ACTIONS.map(action => (
          <button key={action.id} onClick={() => setActiveModal(activeModal === action.id ? null : action.id)}
            className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${
              activeModal === action.id ? 'border-primary bg-primary/5 shadow-md ring-1 ring-primary/20' : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
            }`}>
            <div className={`p-2.5 rounded-lg ${action.color}`}><action.icon size={20} /></div>
            <div className="text-left">
              <span className="font-semibold text-slate-800">{action.label}</span>
              <p className="text-xs text-slate-400 mt-0.5">Click to open</p>
            </div>
          </button>
        ))}
      </div>

      <div className="shrink-0">
        <TransactionFilters filters={filters} onChange={handleFilterChange} products={products} godowns={godowns} />
      </div>
      <div className="bg-white rounded-xl border border-slate-200 flex flex-col flex-1">
        <div className="px-5 py-3.5 border-b border-slate-100 shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-slate-800">Transaction History</h3>
            <span className="text-xs text-slate-400 font-normal">
              ({filteredTransactions.length}{filteredTransactions.length !== transactions.length ? ` of ${transactions.length}` : ''})
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 z-10" size={15} />
              <Input
                type="text"
                placeholder="Search transactions..."
                className="pl-8 pr-8 h-9 text-xs w-full bg-slate-50/50 focus:bg-white"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={handleExport}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline shrink-0"
            >
              <Download size={14} /> Export
            </button>
          </div>
        </div>
        <TransactionTable 
          transactions={currentTransactions} 
          totalItems={filteredTransactions.length}
          searchTerm={searchTerm}
          loading={txnLoading} 
          onEdit={handleEdit}
          onDelete={handleDeleteClick}
          currentPage={currentPage}
          totalPages={totalTransactionPages}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
      </div>

      <FactoryInModal isOpen={activeModal === 'factory-in'} onClose={handleCloseModal}
        products={products} godowns={godowns} productStockMap={productStockMap} user={user} onSuccess={handleSuccess}
        onImportProducts={(product) => setProducts(prev => [...prev, product])}
        editingTransaction={['IN_FACTORY', 'ADJUSTMENT_IN', 'OPEN_STOCK', 'PURCHASE_IN'].includes(editingTransaction?.txn_type) ? editingTransaction : null} />
      <FactoryInModal mode="production" isOpen={activeModal === 'production'} onClose={handleCloseModal}
        products={products} godowns={godowns} productStockMap={productStockMap} user={user} onSuccess={handleSuccess}
        onImportProducts={(product) => setProducts(prev => [...prev, product])}
        editingTransaction={editingTransaction?.txn_type === 'PRODUCTION_IN' ? editingTransaction : null} />
      <TransferModal isOpen={activeModal === 'transfer'} onClose={handleCloseModal}
        products={products} godowns={godowns} productStockMap={productStockMap} user={user} onSuccess={handleSuccess}
        editingTransaction={editingTransaction?.pair_id ? editingTransaction : null} />
      <DispatchModal isOpen={activeModal === 'dispatch'} onClose={handleCloseModal}
        onBulkClick={() => setActiveModal('bulk-dispatch')}
        products={products} godowns={godowns} productStockMap={productStockMap} user={user} onSuccess={handleSuccess}
        editingTransaction={['OUT_GODOWN', 'ADJUSTMENT_OUT'].includes(editingTransaction?.txn_type) ? editingTransaction : null} />
      <BulkDispatchModal isOpen={activeModal === 'bulk-dispatch'} onClose={handleCloseModal}
        user={user} onSuccess={handleSuccess} products={products} godowns={godowns} 
        productStockMap={productStockMap} onImportProducts={(product) => setProducts(prev => [...prev, product])} />

      <DeleteConfirmModal isOpen={!!deletingTransaction} onClose={() => setDeletingTransaction(null)}
        transaction={deletingTransaction} onConfirm={handleDeleteConfirm} loading={deleteLoading}
        products={products} godowns={godowns} />
    </div>
  );
};

export default StockManagement;
