import { useState, useEffect, useMemo } from 'react';
import { Factory, ArrowLeftRight, Truck, Package, Warehouse } from 'lucide-react';
import toast from 'react-hot-toast';
import useAuthStore from '../../store/authStore';
import { getAllProducts, getAllGodowns } from '../../services/masterService';
import { getAllTransactions, voidTransaction } from '../../services/stockService';
import Pagination from '@/components/ui/pagination';
import FactoryInModal from './components/FactoryInModal';
import TransferModal from './components/TransferModal';
import DispatchModal from './components/DispatchModal';
import VoidConfirmModal from './components/VoidConfirmModal';
import { TransactionFilters, TransactionTable } from './components/TransactionTable';

const ACTIONS = [
  { id: 'factory-in', label: 'Factory Stock In', icon: Factory, color: 'bg-blue-50 text-blue-600 border-blue-200' },
  { id: 'transfer', label: 'Transfer Stock', icon: ArrowLeftRight, color: 'bg-amber-50 text-amber-600 border-amber-200' },
  { id: 'dispatch', label: 'Dispatch Out', icon: Truck, color: 'bg-rose-50 text-rose-600 border-rose-200' },
];

const ITEMS_PER_PAGE = 10;

const StockManagement = () => {
  const { user } = useAuthStore();
  const [activeModal, setActiveModal] = useState(null);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [products, setProducts] = useState([]);
  const [godowns, setGodowns] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [txnLoading, setTxnLoading] = useState(true);
  const [voidingTransaction, setVoidingTransaction] = useState(null);
  const [voidLoading, setVoidLoading] = useState(false);
  const [filters, setFilters] = useState({ product_id: '', godown_id: '', txn_type: '', from_date: '', to_date: '' });
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    Promise.all([getAllProducts(), getAllGodowns()])
      .then(([p, g]) => { setProducts(p); setGodowns(g); })
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
    if (txn.txn_type === 'IN_FACTORY' || txn.txn_type === 'ADJUSTMENT_IN' || txn.txn_type === 'OPEN_STOCK') setActiveModal('factory-in');
    else if (txn.pair_id) setActiveModal('transfer');
    else if (txn.txn_type === 'OUT_GODOWN' || txn.txn_type === 'ADJUSTMENT_OUT') setActiveModal('dispatch');
  };

  const handleVoid = (txn) => {
    setVoidingTransaction(txn);
  };

  const handleVoidConfirm = async (reason) => {
    if (!voidingTransaction) return;
    setVoidLoading(true);
    try {
      await voidTransaction(voidingTransaction.txn_id, reason, user?.user_id);
      toast.success('Transaction voided successfully');
      setVoidingTransaction(null);
      fetchTransactions();
    } catch (err) { toast.error(err.message); }
    setVoidLoading(false);
  };

  const handleCloseModal = () => {
    setActiveModal(null);
    setEditingTransaction(null);
  };

  const handleSuccess = () => { setActiveModal(null); setEditingTransaction(null); fetchTransactions(); };

  const totalTransactionPages = Math.max(1, Math.ceil(transactions.length / ITEMS_PER_PAGE));
  const currentTransactions = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return transactions.slice(start, start + ITEMS_PER_PAGE);
  }, [transactions, currentPage]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
        <div className="shrink-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Stock Management</h1>
          <p className="text-slate-500 mt-1 text-sm">Add factory stock, transfer between godowns, and dispatch products.</p>
        </div>
      </div>

      <div className="border-b border-slate-200" />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

      <TransactionFilters filters={filters} onChange={handleFilterChange} products={products} godowns={godowns} />
      <div className="bg-white rounded-xl border border-slate-200 flex-col">
        <TransactionTable transactions={currentTransactions} totalItems={transactions.length} loading={txnLoading} onEdit={handleEdit} onVoid={handleVoid} />
        {!txnLoading && transactions.length > 0 && (
          <Pagination currentPage={currentPage} totalPages={totalTransactionPages} totalItems={transactions.length}
            startIndex={(currentPage - 1) * ITEMS_PER_PAGE + 1} endIndex={Math.min(currentPage * ITEMS_PER_PAGE, transactions.length)}
            onPageChange={setCurrentPage} className="border-t border-slate-200" />
        )}
      </div>

      <FactoryInModal isOpen={activeModal === 'factory-in'} onClose={handleCloseModal}
        products={products} godowns={godowns} user={user} onSuccess={handleSuccess}
        editingTransaction={['IN_FACTORY', 'ADJUSTMENT_IN', 'OPEN_STOCK'].includes(editingTransaction?.txn_type) ? editingTransaction : null} />
      <TransferModal isOpen={activeModal === 'transfer'} onClose={handleCloseModal}
        products={products} godowns={godowns} user={user} onSuccess={handleSuccess}
        editingTransaction={editingTransaction?.pair_id ? editingTransaction : null} />
      <DispatchModal isOpen={activeModal === 'dispatch'} onClose={handleCloseModal}
        products={products} godowns={godowns} user={user} onSuccess={handleSuccess}
        editingTransaction={['OUT_GODOWN', 'ADJUSTMENT_OUT'].includes(editingTransaction?.txn_type) ? editingTransaction : null} />

      <VoidConfirmModal isOpen={!!voidingTransaction} onClose={() => setVoidingTransaction(null)}
        transaction={voidingTransaction} onConfirm={handleVoidConfirm} loading={voidLoading}
        products={products} godowns={godowns} />
    </div>
  );
};

export default StockManagement;
