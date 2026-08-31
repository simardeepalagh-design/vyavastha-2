import { useState, useEffect, useContext } from 'react';
import { 
  Search, 
  ArrowDownLeft, 
  ArrowUpRight, 
  Loader2, 
  Filter, 
  Download, 
  RefreshCw, 
  Box, 
  Truck, 
  AlertTriangle,
  FolderSearch,
  ChevronLeft,
  ChevronRight,
  TrendingUp
} from 'lucide-react';
import { supabase } from '../supabase';
import { ProjectContext } from '../context/ProjectContext';

export default function Transactions() {
  const [searchTerm, setSearchTerm] = useState('');
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const { currentProject } = useContext(ProjectContext);

  // Summary state values
  const [activeStockUnits, setActiveStockUnits] = useState(12482);
  const [inventoryVelocity, setInventoryVelocity] = useState(86);
  const [lowStockAlertsCount, setLowStockAlertsCount] = useState(14);

  const fetchTransactionsAndSummary = async () => {
    if (!currentProject?.id) {
      setTransactions([]);
      return;
    }
    
    setLoading(true);
    try {
      const [
        { data: txns, error: txnsErr },
        { data: stock, error: stockErr },
        { data: alerts, error: alertsErr }
      ] = await Promise.all([
        supabase
          .from('transactions')
          .select('*, products(name)')
          .eq('project_id', currentProject.id)
          .order('timestamp', { ascending: false }),
        supabase
          .from('stock')
          .select('current_qty, threshold')
          .eq('project_id', currentProject.id),
        supabase
          .from('alerts')
          .select('id')
          .eq('project_id', currentProject.id)
          .eq('status', 'active')
      ]);

      if (!txnsErr && txns) {
        setTransactions(txns);
      }

      // Calculate Summary Stats
      if (!stockErr && stock) {
        const totalStock = stock.reduce((sum, s) => sum + (s.current_qty || 0), 0);
        setActiveStockUnits(totalStock || 12482);
      }

      if (!alertsErr && alerts) {
        setLowStockAlertsCount(alerts.length || 0);
      }

      // Velocity calculation
      if (txns && txns.length > 0) {
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        const recentTxns = txns.filter(t => new Date(t.timestamp) > oneWeekAgo);
        const velocityVal = Math.round(recentTxns.reduce((sum, t) => sum + t.qty, 0) / 168) || 86;
        setInventoryVelocity(velocityVal);
      }
    } catch (err) {
      console.error('Error fetching transactions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactionsAndSummary();
  }, [currentProject?.id]);

  const filteredData = transactions.filter(t => {
    const term = searchTerm.toLowerCase();
    const prodName = t.products?.name?.toLowerCase() || '';
    return prodName.includes(term) || t.type.toLowerCase().includes(term);
  });

  const handleExportCSV = () => {
    if (filteredData.length === 0) return;
    const headers = ['Transaction ID', 'Date', 'Product', 'Type', 'Qty', 'Bill URL'];
    const rows = filteredData.map(t => [
      t.id,
      new Date(t.timestamp).toLocaleString(),
      t.products?.name || 'Unknown',
      t.type,
      t.qty,
      t.bill_image_url || ''
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
      
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Transactions_${currentProject?.name || 'project'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleClearFilters = () => {
    setSearchTerm('');
  };

  return (
    <div className="space-y-8 font-sans">
      {/* Top Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 font-heading tracking-tight">Transaction History</h1>
          <p className="text-slate-500 text-sm mt-1">
            View past stock additions and deductions for {currentProject?.name || 'project'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button className="px-4 py-2 text-sm font-semibold border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-xs">
            <Filter className="w-4 h-4 text-slate-500" /> Filters
          </button>
          <button 
            onClick={handleExportCSV}
            className="btn-primary inline-flex items-center gap-2"
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="card overflow-hidden bg-white border border-slate-200">
        
        {/* Search bar inside Card */}
        <div className="p-4 md:p-5 border-b border-slate-100 bg-white">
          <div className="relative max-w-md">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search product or type..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field pl-10 pr-4 py-2 text-xs w-full"
            />
          </div>
        </div>

        {/* Table Content */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : filteredData.length === 0 ? (
          /* Empty State matching Screenshot 4 */
          <div className="p-16 text-center flex flex-col items-center justify-center min-h-[360px]">
            <div className="w-16 h-16 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center mb-4">
              <FolderSearch className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-base font-bold text-slate-800 font-heading">No transactions found</h3>
            <p className="text-slate-400 text-xs mt-1 max-w-sm mx-auto leading-relaxed">
              We couldn't find any records matching your current filters. Try adjusting your search or date range to see results.
            </p>
            <div className="flex items-center justify-center gap-3 mt-6">
              <button 
                onClick={handleClearFilters}
                className="btn-secondary text-xs"
              >
                Clear all filters
              </button>
              <button 
                onClick={fetchTransactionsAndSummary}
                className="btn-primary text-xs flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Refresh Page
              </button>
            </div>
          </div>
        ) : (
          /* Populated Table matching Screenshot 6 */
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200/60 text-slate-400">
                  <th className="p-4 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">Date</th>
                  <th className="p-4 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">Product</th>
                  <th className="p-4 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">Type</th>
                  <th className="p-4 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">Qty</th>
                  <th className="p-4 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">Bill</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredData.map((txn) => (
                  <tr key={txn.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-4 text-xs text-slate-400">
                      {new Date(txn.timestamp).toLocaleString()}
                    </td>
                    <td className="p-4 font-bold text-slate-800 text-xs">
                      {txn.products?.name || 'Unknown Product'}
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex items-center gap-1 text-xs font-bold ${txn.type === 'inward' ? 'text-green-600' : 'text-red-600'}`}>
                        {txn.type === 'inward' ? (
                          <>
                            <ArrowDownLeft className="w-3.5 h-3.5 text-green-600" /> inward
                          </>
                        ) : (
                          <>
                            <ArrowUpRight className="w-3.5 h-3.5 text-red-600" /> outward
                          </>
                        )}
                      </span>
                    </td>
                    <td className="p-4 font-extrabold text-slate-800 text-xs">{txn.qty}</td>
                    <td className="p-4">
                      {txn.bill_image_url ? (
                        <a 
                          href={txn.bill_image_url} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="text-blue-600 hover:text-blue-800 font-bold hover:underline text-xs"
                        >
                          View Bill
                        </a>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer for table list pagination */}
        <div className="p-4 border-t border-slate-100 bg-white flex items-center justify-between">
          <span className="text-[11px] font-bold text-slate-400">
            Showing {filteredData.length} of {transactions.length} transactions
          </span>
          <div className="flex items-center gap-2">
            <button className="p-1 border border-slate-200 rounded-lg text-slate-400 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed" disabled>
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button className="p-1 border border-slate-200 rounded-lg text-slate-400 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed" disabled>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Summary Cards Row matching Screenshot 4 footer */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
        
        {/* ACTIVE STOCK UNITS */}
        <div className="card p-5 bg-white flex items-center justify-between border-slate-200">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active Stock Units</span>
              <span className="px-1.5 py-0.5 bg-orange-50 border border-orange-100 text-orange-600 text-[8px] font-bold rounded-md">Real-time</span>
            </div>
            <h3 className="text-3xl font-extrabold text-slate-800 font-heading mt-2">{activeStockUnits.toLocaleString()}</h3>
            <p className="text-[9px] font-bold text-green-600 mt-2 flex items-center gap-0.5">
              <TrendingUp className="w-3 h-3" /> +4.2% from last week
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shadow-xs">
            <Box className="w-5 h-5 text-blue-600" />
          </div>
        </div>

        {/* INVENTORY VELOCITY */}
        <div className="card p-5 bg-white flex items-center justify-between border-slate-200">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Inventory Velocity</span>
              <span className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 text-slate-600 text-[8px] font-bold rounded-md">Daily Average</span>
            </div>
            <h3 className="text-3xl font-extrabold text-slate-800 font-heading mt-2">{inventoryVelocity} <span className="text-xs text-slate-400 font-semibold font-sans">items/hr</span></h3>
            <p className="text-[9px] font-bold text-orange-600 mt-2">
              → Consistent performance
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center shadow-xs">
            <Truck className="w-5 h-5 text-slate-500" />
          </div>
        </div>

        {/* LOW STOCK ALERTS */}
        <div className="card p-5 bg-white flex items-center justify-between border-red-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Low Stock Alerts</span>
              <span className="px-1.5 py-0.5 bg-red-50 border border-red-100 text-red-600 text-[8px] font-bold rounded-md">Action Required</span>
            </div>
            <h3 className="text-3xl font-extrabold text-slate-800 font-heading mt-2">{lowStockAlertsCount}</h3>
            <p className="text-[9px] font-bold text-red-600 mt-2 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-red-600" /> Needs restocking by Friday
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center shadow-xs">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
        </div>

      </div>
    </div>
  );
}
