import { useState, useEffect, useMemo } from 'react';
import { Search, Package, Warehouse, Plus, FileSpreadsheet } from 'lucide-react';
import toast from 'react-hot-toast';
import useAuthStore from '../../store/authStore';
import { getAllGodowns, getAllProducts, getAllProductStock, toggleGodownStatus } from '../../services/masterService';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/Select';
import Pagination from '@/components/ui/pagination';
import ProductModal from './components/ProductModal';
import ProductTable from './components/ProductTable';
import GodownModal from './components/GodownModal';
import GodownTable from './components/GodownTable';
import BulkImportModal from './components/BulkImportModal';

const TABS = [
  { id: 'products', label: 'Products', icon: Package },
  { id: 'godowns', label: 'Godowns', icon: Warehouse },
];

const ITEMS_PER_PAGE = 10;

const Master = () => {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState('products');
  const [products, setProducts] = useState([]);
  const [godowns, setGodowns] = useState([]);
  const [allStock, setAllStock] = useState([]);
  const [loading, setLoading] = useState(true);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [godownModalOpen, setGodownModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [godownFilter, setGodownFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);

  const filteredProducts = useMemo(() => {
    let result = products.filter(p =>
      p.name?.toLowerCase().includes(searchTerm.toLowerCase())
    );
    if (godownFilter !== 'all') {
      result = result.filter(p =>
        allStock.some(s => s.product_id === p.product_id && s.godown_id === godownFilter)
      );
    }
    return result;
  }, [products, searchTerm, godownFilter, allStock]);

  const filteredGodowns = useMemo(() => {
    return godowns.filter(g =>
      g.name?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [godowns, searchTerm]);

  const totalProductPages = Math.max(1, Math.ceil(filteredProducts.length / ITEMS_PER_PAGE));
  const totalGodownPages = Math.max(1, Math.ceil(filteredGodowns.length / ITEMS_PER_PAGE));

  const currentProducts = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredProducts.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredProducts, currentPage]);

  const currentGodowns = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredGodowns.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredGodowns, currentPage]);

  const stockMap = useMemo(() => {
    const map = {};
    for (const s of allStock) {
      if (!map[s.product_id]) map[s.product_id] = [];
      const godown = godowns.find(g => g.godown_id === s.godown_id);
      if (godown) {
        map[s.product_id].push({ godown_name: godown.name, godown_id: s.godown_id, current_stock: s.current_stock ?? 0 });
      }
    }
    return map;
  }, [allStock, godowns]);

  useEffect(() => { loadData(); }, []);
  useEffect(() => { setCurrentPage(1); }, [searchTerm, activeTab, godownFilter]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [p, g, s] = await Promise.all([getAllProducts(), getAllGodowns(), getAllProductStock()]);
      setProducts(p); setGodowns(g); setAllStock(s);
    } catch (err) { toast.error('Failed to load data'); }
    setLoading(false);
  };

  const handleEditProduct = (product) => {
    setEditingProduct(product);
    setProductModalOpen(true);
  };

  const handleCloseProductModal = () => {
    setProductModalOpen(false);
    setEditingProduct(null);
  };

  const handleToggleGodown = async (godown) => {
    try {
      await toggleGodownStatus(godown.godown_id, !godown.is_active);
      toast.success(`Godown ${godown.is_active ? 'deactivated' : 'activated'}`);
      loadData();
    } catch (err) { toast.error(err.message); }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
        <div className="shrink-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Master</h1>
          <p className="text-slate-500 mt-1 text-sm">Manage products and godowns.</p>
        </div>
      </div>

      <div className="flex items-center gap-6 border-b border-slate-200">
        {TABS.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`pb-3 text-sm font-medium transition-all flex items-center gap-2 ${
              activeTab === tab.id
                ? 'text-primary border-b-2 border-primary translate-y-[1px]'
                : 'text-slate-500 hover:text-slate-700'
            }`}>
            <tab.icon size={18} />{tab.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="relative w-full md:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" size={18} />
              <Input type="text" placeholder={`Search ${activeTab === 'products' ? 'products' : 'godowns'}...`} className="pl-9"
                value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
            {activeTab === 'products' && godowns.length > 0 && (
              <div className="w-full md:w-48">
                <Select value={godownFilter} onValueChange={setGodownFilter}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="All Godowns" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Filter by Godown</SelectLabel>
                      <SelectItem value="all">All Godowns</SelectItem>
                      {godowns.map(g => (
                        <SelectItem key={g.godown_id} value={g.godown_id}>{g.name}</SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            {!loading && (
              <>
                {activeTab === 'products' && (
                  <Button onClick={() => setImportModalOpen(true)} variant="outline"
                    className="gap-2 px-4 font-medium">
                    <FileSpreadsheet size={20} /><span>Import</span>
                  </Button>
                )}
                <Button onClick={() => activeTab === 'products' ? (setEditingProduct(null), setProductModalOpen(true)) : setGodownModalOpen(true)}
                  className="gap-2 px-4 font-medium">
                  <Plus size={20} /><span>Add {activeTab === 'products' ? 'Product' : 'Godown'}</span>
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="space-y-6">
          {activeTab === 'products' && (
            <div className="bg-white rounded-xl border border-slate-200 flex-col">
              <ProductTable products={currentProducts} totalItems={filteredProducts.length} loading={loading} onEdit={handleEditProduct} searchTerm={searchTerm} stockMap={stockMap} />
              {!loading && filteredProducts.length > 0 && (
                <Pagination currentPage={currentPage} totalPages={totalProductPages} totalItems={filteredProducts.length}
                  startIndex={(currentPage - 1) * ITEMS_PER_PAGE + 1} endIndex={Math.min(currentPage * ITEMS_PER_PAGE, filteredProducts.length)}
                  onPageChange={setCurrentPage} className="border-t border-slate-200" />
              )}
            </div>
          )}
          {activeTab === 'godowns' && (
            <div className="bg-white rounded-xl border border-slate-200 flex-col">
              <GodownTable godowns={currentGodowns} totalItems={filteredGodowns.length} loading={loading} onToggle={handleToggleGodown} searchTerm={searchTerm} />
              {!loading && filteredGodowns.length > 0 && (
                <Pagination currentPage={currentPage} totalPages={totalGodownPages} totalItems={filteredGodowns.length}
                  startIndex={(currentPage - 1) * ITEMS_PER_PAGE + 1} endIndex={Math.min(currentPage * ITEMS_PER_PAGE, filteredGodowns.length)}
                  onPageChange={setCurrentPage} className="border-t border-slate-200" />
              )}
            </div>
          )}
        </div>
      </div>

      <ProductModal isOpen={productModalOpen} onClose={handleCloseProductModal}
        godowns={godowns} user={user} onSuccess={loadData} editingProduct={editingProduct} />
      <GodownModal isOpen={godownModalOpen} onClose={() => setGodownModalOpen(false)}
        onSuccess={loadData} />
      <BulkImportModal isOpen={importModalOpen} onClose={() => setImportModalOpen(false)}
        user={user} onSuccess={loadData} />
    </div>
  );
};

export default Master;
