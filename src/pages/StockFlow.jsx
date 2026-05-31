import { useState, useEffect, useContext } from 'react';
import { UploadCloud, FileText, CheckCircle2, Loader2, Plus, Trash2, Edit2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';
import { ProjectContext } from '../context/ProjectContext';

export default function StockFlow({ type, user }) {
  const [step, setStep] = useState(1); // 1: Upload, 2: Loading, 3: Confirm, 4: Success, 5: Processing DB
  const [items, setItems] = useState([]);
  const navigate = useNavigate();
  const { currentProject } = useContext(ProjectContext);
  
  const currentProjectId = currentProject?.id;
  
  const isAdd = type === 'add';
  const title = isAdd ? "Upload Bill to Add Stock" : "Upload Bill to Deduct Stock";
  const confirmTitle = isAdd ? "Confirm Extracted Items" : "Confirm Items to Deduct";
  
  // Reset step when type changes
  useEffect(() => {
    setStep(1);
  }, [type]);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setStep(2);

    const reader = new FileReader();
    
    reader.onloadend = async () => {
      try {
        const base64 = reader.result?.split(',')[1];
        
        if (!base64) {
          throw new Error('Image could not be read');
        }

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${import.meta.env.VITE_GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [
                  {
                    inline_data: {
                      mime_type: file.type || 'image/jpeg',
                      data: base64
                    }
                  },
                  {
                    text: `Read this bill image carefully. 
                  Extract every line item and return 
                  ONLY a JSON array, no markdown, 
                  no backticks, no explanation.
                  Format: [{"name":"product name","qty":100,"unit":"Pcs"}]
                  If unit not clear use Pcs as default.`
                  }
                ]
              }]
            })
          }
        );

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(`Gemini API Error (${response.status}): ${errData.error?.message || response.statusText}`);
        }

        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!text) throw new Error('No response from Gemini');

        const cleaned = text.replace(/```json|```/g, '').trim();
        const parsedItems = JSON.parse(cleaned);
        
        const newItems = parsedItems.map((item, index) => ({
          id: index + 1,
          name: item.name || '',
          qty: item.qty || 0,
          unit: item.unit || 'Pcs'
        }));

        setItems(newItems);
        setStep(3);

      } catch (err) {
        console.error('Gemini error:', err);
        alert('Could not read bill. Please try again.');
        setItems([]);
        setStep(3);
      }
    };

    reader.onerror = () => {
      alert('Could not load image file.');
      setItems([]);
      setStep(3);
    };

    reader.readAsDataURL(file);
  };

  const handleConfirm = async () => {
    if (!currentProjectId) {
      alert('No project selected. Please contact your administrator.');
      return;
    }
    setStep(5);

    try {
      const currentUserId = user?.id;
      const now = new Date().toISOString();

      for (const item of items) {
        if (!item.name?.trim() || item.qty <= 0) continue;

        // ── Step 1: Find product by name + project_id (never duplicate) ──
        const { data: existingProducts, error: findErr } = await supabase
          .from('products')
          .select('id')
          .eq('name', item.name.trim())
          .eq('project_id', currentProjectId)
          .limit(1);

        if (findErr) throw findErr;

        let productId;

        if (existingProducts && existingProducts.length > 0) {
          // ── Step 2: Product exists → reuse its id ──
          productId = existingProducts[0].id;
        } else {
          // ── Step 3: Product not found ──
          if (!isAdd) {
            alert(`Cannot deduct: "${item.name}" not found in this project's inventory.`);
            setStep(3);
            return;
          }
          // Insert new product row (only for add flow)
          const { data: newProduct, error: prodErr } = await supabase
            .from('products')
            .insert({
              name: item.name.trim(),
              unit: item.unit,
              project_id: currentProjectId,
              category: 'General'
            })
            .select('id')
            .single();

          if (prodErr) throw prodErr;
          productId = newProduct.id;
        }

        // ── Step 4: Fetch current stock row for this product ──
        const { data: stockRows } = await supabase
          .from('stock')
          .select('current_qty, threshold')
          .eq('product_id', productId)
          .limit(1);

        const existingStock = stockRows && stockRows.length > 0 ? stockRows[0] : null;
        const currentQty = existingStock?.current_qty ?? 0;
        const threshold = existingStock?.threshold ?? 10;

        if (isAdd) {
          // ── Step 5 (Add): Upsert stock — adds to existing qty, never duplicates ──
          const { error: upsertErr } = await supabase
            .from('stock')
            .upsert(
              {
                product_id: productId,
                project_id: currentProjectId,
                current_qty: currentQty + item.qty,
                threshold,
                last_updated: now
              },
              { onConflict: 'product_id' }
            );

          if (upsertErr) throw upsertErr;

          // ── Step 6 (Add): Log inward transaction ──
          await supabase.from('transactions').insert({
            product_id: productId,
            project_id: currentProjectId,
            type: 'inward',
            qty: item.qty,
            bill_image_url: null,
            confirmed_by: currentUserId,
            timestamp: now
          });

        } else {
          // ── Step 5 (Deduct): Validate sufficient stock ──
          if (currentQty - item.qty < 0) {
            alert(`Cannot deduct ${item.qty} of "${item.name}" — only ${currentQty} in stock.`);
            setStep(3);
            return;
          }

          const newQty = currentQty - item.qty;

          // ── Step 6 (Deduct): Update stock ──
          const { error: updateErr } = await supabase
            .from('stock')
            .update({ current_qty: newQty, last_updated: now })
            .eq('product_id', productId);

          if (updateErr) throw updateErr;

          // ── Step 7 (Deduct): Log outward transaction ──
          await supabase.from('transactions').insert({
            product_id: productId,
            project_id: currentProjectId,
            type: 'outward',
            qty: item.qty,
            bill_image_url: null,
            confirmed_by: currentUserId,
            timestamp: now
          });

          // ── Step 8 (Deduct): Trigger alert if below threshold ──
          if (newQty < threshold) {
            await supabase.from('alerts').insert({
              product_id: productId,
              project_id: currentProjectId,
              status: 'active',
              triggered_at: now
            });
          }
        }
      }

      setStep(4);
      setTimeout(() => {
        navigate('/dashboard');
      }, 3000);

    } catch (err) {
      console.error('Stock operation failed:', err);
      alert('An error occurred while saving. Please try again.');
      setStep(3);
    }
  };

  const updateItem = (id, field, value) => {
    setItems(items.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const deleteItem = (id) => {
    setItems(items.filter(item => item.id !== id));
  };

  const addItem = () => {
    const newId = items.length > 0 ? Math.max(...items.map(i => i.id)) + 1 : 1;
    setItems([...items, { id: newId, name: '', qty: 0, unit: 'pcs' }]);
  };

  if (step === 1) {
    return (
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-6">{title}</h1>
        
        <label className="card p-8 md:p-12 text-center border-dashed border-2 border-border hover:border-primary/50 transition-colors cursor-pointer group block">
          <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} />
          <div className="w-16 h-16 bg-navy rounded-full flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform">
            <UploadCloud className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-xl font-medium text-white mb-2">Drop bill image here or click to upload</h3>
          <p className="text-text-muted text-sm mb-8">Supported formats: JPG, PNG</p>
          
          <div className="btn-primary inline-flex items-center justify-center mx-auto min-w-[200px]">
            <FileText className="w-5 h-5 mr-2" /> Scan Bill
          </div>
        </label>
      </div>
    );
  }

  if (step === 2 || step === 5) {
    return (
      <div className="max-w-3xl mx-auto flex flex-col items-center justify-center min-h-[400px]">
        <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
        <h2 className="text-xl font-bold text-white">{step === 2 ? 'Gemini is reading your bill...' : 'Updating Database...'}</h2>
        <p className="text-text-muted mt-2">{step === 2 ? 'Extracting items and quantities with AI' : 'Saving items to your inventory'}</p>
      </div>
    );
  }

  if (step === 3) {
    return (
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-6">{confirmTitle}</h1>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="card overflow-hidden">
              <div className="p-4 border-b border-border flex justify-between items-center bg-navy">
                <h3 className="font-semibold text-white">Extracted Items</h3>
                <button onClick={addItem} className="text-sm flex items-center text-primary hover:text-primary-hover">
                  <Plus className="w-4 h-4 mr-1" /> Add Row
                </button>
              </div>
              <div className="p-4">
                <div className="space-y-3">
                  {items.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 bg-navy p-3 rounded-lg border border-border">
                      <div className="flex-1">
                        <input 
                          type="text" 
                          value={item.name} 
                          onChange={(e) => updateItem(item.id, 'name', e.target.value)}
                          className="input-field py-1.5 text-sm"
                          placeholder="Item Name"
                        />
                      </div>
                      <div className="w-24">
                        <input 
                          type="number" 
                          value={item.qty} 
                          onChange={(e) => updateItem(item.id, 'qty', parseInt(e.target.value) || 0)}
                          className="input-field py-1.5 text-sm"
                          placeholder="Qty"
                        />
                      </div>
                      <div className="w-24">
                        <select 
                          value={item.unit}
                          onChange={(e) => updateItem(item.id, 'unit', e.target.value)}
                          className="input-field py-1.5 text-sm appearance-none bg-navy-light"
                        >
                          <option value="pcs">pcs</option>
                          <option value="m">m</option>
                          <option value="kg">kg</option>
                          <option value="bags">bags</option>
                        </select>
                      </div>
                      <button 
                        onClick={() => deleteItem(item.id)}
                        className="p-2 text-text-muted hover:text-danger hover:bg-danger/10 rounded-md transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="p-4 border-t border-border bg-navy-light flex justify-end gap-3">
                <button onClick={() => setStep(1)} className="btn-secondary">Cancel</button>
                <button onClick={handleConfirm} className="btn-primary bg-success hover:bg-emerald-600 shadow-[0_0_15px_rgba(16,185,129,0.3)]">
                  Confirm & {isAdd ? 'Add to Stock' : 'Deduct from Stock'}
                </button>
              </div>
            </div>
          </div>
          
          <div className="card p-4 h-[500px] flex flex-col">
            <h3 className="font-semibold text-white mb-4 border-b border-border pb-3">Bill Preview</h3>
            <div className="flex-1 bg-navy border border-border rounded-lg flex items-center justify-center relative overflow-hidden">
              {/* Mock bill preview */}
              <div className="absolute inset-0 opacity-20 pointer-events-none" style={{
                backgroundImage: 'repeating-linear-gradient(45deg, #1E293B 25%, transparent 25%, transparent 75%, #1E293B 75%, #1E293B), repeating-linear-gradient(45deg, #1E293B 25%, transparent 25%, transparent 75%, #1E293B 75%, #1E293B)',
                backgroundPosition: '0 0, 10px 10px',
                backgroundSize: '20px 20px'
              }}></div>
              <FileText className="w-16 h-16 text-text-muted opacity-50" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Step 4: Success Toast/View
  return (
    <div className="max-w-md mx-auto text-center py-20 flex flex-col items-center">
      <div className="w-20 h-20 bg-success/20 rounded-full flex items-center justify-center mb-6">
        <CheckCircle2 className="w-10 h-10 text-success" />
      </div>
      <h2 className="text-2xl font-bold text-white">Stock {isAdd ? 'updated' : 'deducted'} successfully!</h2>
      <p className="text-text-muted mt-2">Redirecting back...</p>
    </div>
  );
}
