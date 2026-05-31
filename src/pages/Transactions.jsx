import { useState, useEffect, useContext } from 'react';
import { Search, ArrowUpDown, ArrowDownLeft, ArrowUpRight, Loader2 } from 'lucide-react';
import { supabase } from '../supabase';
import { ProjectContext } from '../context/ProjectContext';

export default function Transactions() {
  const [searchTerm, setSearchTerm] = useState('');
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const { currentProject } = useContext(ProjectContext);

  useEffect(() => {
    if (!currentProject?.id) {
      setTransactions([]);
      return;
    }

    const fetchTransactions = async () => {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('transactions')
        .select(`
          *,
          products(name)
        `)
        .eq('project_id', currentProject.id)
        .order('timestamp', { ascending: false });

      if (!error && data) {
        setTransactions(data);
      }
      setLoading(false);
    };

    fetchTransactions();
  }, [currentProject?.id]);

  const filteredData = transactions.filter(t => {
    const term = searchTerm.toLowerCase();
    const prodName = t.products?.name?.toLowerCase() || '';
    return prodName.includes(term) || t.type.toLowerCase().includes(term);
  });

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Transaction History</h1>
        <p className="text-text-muted mt-1">View past stock additions and deductions for {currentProject?.name || 'this project'}</p>
      </div>

      <div className="card overflow-hidden">
        <div className="p-4 md:p-6 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input 
              type="text" 
              placeholder="Search product or type..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field pl-9 py-2 text-sm w-full"
            />
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-navy border-b border-border">
                <th className="p-4 text-xs font-semibold text-text-muted uppercase tracking-wider whitespace-nowrap">Date <ArrowUpDown className="w-3 h-3 inline ml-1" /></th>
                <th className="p-4 text-xs font-semibold text-text-muted uppercase tracking-wider whitespace-nowrap">Product</th>
                <th className="p-4 text-xs font-semibold text-text-muted uppercase tracking-wider whitespace-nowrap">Type</th>
                <th className="p-4 text-xs font-semibold text-text-muted uppercase tracking-wider whitespace-nowrap text-right">Qty</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="4" className="p-8 text-center text-text-muted">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
                  </td>
                </tr>
              ) : filteredData.length === 0 ? (
                <tr>
                  <td colSpan="4" className="p-8 text-center text-text-muted">
                    No transactions found.
                  </td>
                </tr>
              ) : (
                filteredData.map((txn) => (
                  <tr key={txn.id} className="border-b border-border/50 hover:bg-navy-lighter/30 transition-colors">
                    <td className="p-4 text-sm text-text-muted">
                      {new Date(txn.timestamp).toLocaleString()}
                    </td>
                    <td className="p-4 font-medium text-white text-sm">
                      {txn.products?.name || 'Unknown Product'}
                    </td>
                    <td className="p-4">
                      <div className={`inline-flex items-center text-sm font-medium ${txn.type === 'inward' ? 'text-success' : 'text-danger'}`}>
                        {txn.type === 'inward' ? <ArrowDownLeft className="w-4 h-4 mr-1" /> : <ArrowUpRight className="w-4 h-4 mr-1" />}
                        {txn.type}
                      </div>
                    </td>
                    <td className="p-4 text-sm font-medium text-white text-right">{txn.qty}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
