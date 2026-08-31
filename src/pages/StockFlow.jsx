import { useState, useEffect, useContext } from 'react';
import { 
  UploadCloud, 
  FileText, 
  CheckCircle2, 
  Loader2, 
  Plus, 
  Trash2, 
  Edit2, 
  Lightbulb, 
  Ruler, 
  ShieldCheck, 
  Image as ImageIcon 
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';
import { ProjectContext } from '../context/ProjectContext';
import * as XLSX from "xlsx";
import Papa from "papaparse";
import { extractExcelWithGemini } from "../services/geminiExcel";

const BILLS_BUCKET = 'bills'; // single source of truth for the bucket name

export default function StockFlow({ type, user }) {
  const [step, setStep] = useState(1); // 1: Upload, 2: Loading, 3: Confirm, 4: Success, 5: Processing DB
  const [items, setItems] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [billImageUrl, setBillImageUrl] = useState(null);
  const [billFileType, setBillFileType] = useState(null); // 'pdf' | 'image' | null
  const navigate = useNavigate();
  const { currentProject } = useContext(ProjectContext);

  const currentProjectId = currentProject?.id;

  const isAdd = type === 'add';
  const title = isAdd ? "Upload Bill to Add Stock" : "Upload Bill to Deduct Stock";
  const confirmTitle = isAdd ? "Confirm Extracted Items" : "Confirm Items to Deduct";

  // Reset step when type changes
  useEffect(() => {
    setStep(1);
    setBillImageUrl(null);
    setBillFileType(null);
    setIsSubmitting(false);
  }, [type]);

  const compressImage = (file) => {
    return new Promise((resolve) => {
      if (!file.type.startsWith('image/')) {
        resolve(file); // skip compression for PDFs
        return;
      }

      const img = new Image();
      const reader = new FileReader();

      reader.onload = (e) => {
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const maxWidth = 1600;
          const scale = Math.min(1, maxWidth / img.width);

          canvas.width = img.width * scale;
          canvas.height = img.height * scale;

          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          canvas.toBlob((blob) => {
            resolve(
              new File([blob], file.name, {
                type: 'image/jpeg'
              })
            );
          }, 'image/jpeg', 0.8);
        };

        img.src = e.target.result;
      };

      reader.readAsDataURL(file);
    });
  };

  // Detect file type up-front from the ORIGINAL file
  const getFileKind = (file) => {
    const mime = (file.type || '').toLowerCase();

    if (mime === 'application/pdf') return 'pdf';
    if (mime.startsWith('image/')) return 'image';

    const ext = file.name.split('.').pop()?.toLowerCase();

    if (ext === 'pdf') return 'pdf';

    if (
      ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)
    ) {
      return 'image';
    }

    return null;
  };

  const uploadBillImage = async (file) => {
    if (!currentProjectId) {
      throw new Error('No project selected');
    }

    const safeFileName = file.name.replace(
      /[^a-zA-Z0-9.-]/g,
      '-'
    );

    const filePath = `${currentProjectId}/${Date.now()}-${crypto.randomUUID()}-${safeFileName}`;

    const { error } = await supabase.storage
      .from(BILLS_BUCKET)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || undefined,
      });

    if (error) {
      console.error('Supabase upload error:', error);
      throw new Error(`Upload failed: ${error.message}`);
    }

    // Try public URL first
    const { data: publicData } = supabase.storage
      .from(BILLS_BUCKET)
      .getPublicUrl(filePath);

    if (publicData?.publicUrl) {
      try {
        const head = await fetch(
          publicData.publicUrl,
          { method: 'HEAD' }
        );

        if (head.ok) {
          return publicData.publicUrl;
        }
      } catch {
        // fall through to signed URL
      }
    }

    // Fallback to signed URL
    const { data: signedData, error: signedErr } =
      await supabase.storage
        .from(BILLS_BUCKET)
        .createSignedUrl(filePath, 60 * 60);

    if (signedErr) {
      console.error('Signed URL error:', signedErr);

      throw new Error(
        `Could not generate a preview URL: ${signedErr.message}`
      );
    }

    return signedData.signedUrl;
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];

    if (!file) return;

    if (!currentProjectId) {
      alert(
        'No project selected. Please contact your administrator.'
      );
      return;
    }

    setBillImageUrl(null);
    setBillFileType(getFileKind(file));
    setStep(2);

    const reader = new FileReader();

    reader.onloadend = async () => {
      try {
        const base64 =
          reader.result?.split(',')[1];

        if (!base64) {
          throw new Error(
            'Image could not be read'
          );
        }

        const compressedFile =
          await compressImage(file);

        const uploadedBillImageUrl =
          await uploadBillImage(
            compressedFile
          );

        setBillImageUrl(
          uploadedBillImageUrl
        );

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${import.meta.env.VITE_GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              contents: [{
                parts: [
                  {
                    inline_data: {
                      mime_type:
                        file.type ||
                        'image/jpeg',
                      data: base64
                    }
                  },
                  {
                    text: `Read this bill image carefully.
Extract every line item and return
ONLY a JSON array, no markdown,
no backticks, no explanation.

Format:
[{"name":"product name","qty":100,"unit":"Pcs"}]

If unit not clear use Pcs as default.

Extract EVERY SINGLE line item from this document,
no matter how many there are.
Do not skip or summarize any rows.
Return ALL items found, even if there are 50+ items.`
                  }
                ]
              }]
            })
          }
        );

        if (!response.ok) {
          const errData =
            await response
              .json()
              .catch(() => ({}));

          throw new Error(
            `Gemini API Error (${response.status}): ${errData.error?.message ||
            response.statusText
            }`
          );
        }

        const data =
          await response.json();

        const text =
          data?.candidates?.[0]
            ?.content?.parts?.[0]?.text;

        if (!text) {
          throw new Error(
            'No response from Gemini'
          );
        }

        const cleaned = text
          .replace(/```json|```/g, '')
          .trim();

        const parsedItems =
          JSON.parse(cleaned);

        const newItems =
          parsedItems.map(
            (item, index) => ({
              id: index + 1,
              name: item.name || '',
              qty: item.qty || 0,
              unit: item.unit || 'Pcs'
            })
          );

        setItems(newItems);
        setStep(3);

      } catch (err) {
        console.error(
          'Gemini error:',
          err
        );

        alert(
          err.message ||
          'Could not read bill. Please try again.'
        );

        setItems([]);
        setStep(3);
      }
    };

    reader.onerror = () => {
      alert(
        'Could not load image file.'
      );

      setItems([]);
      setStep(3);
    };

    reader.readAsDataURL(file);
  };

  const handleExcelUpload = async (e) => {
    const file = e.target.files[0];

    if (!file) return;

    const extension =
      file.name
        .split(".")
        .pop()
        .toLowerCase();

    // ---------- CSV ----------
    if (extension === "csv") {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,

        complete: async (results) => {
          try {
            const imported =
              await extractExcelWithGemini(
                results.data
              );

            setItems(imported);
            setStep(3);

          } catch (err) {
            console.error(err);

            alert(
              "Unable to process CSV using Gemini."
            );
          }
        },

        error: () => {
          alert(
            "Unable to read CSV file."
          );
        },
      });

      return;
    }

    // ---------- XLSX / XLS ----------
    const reader =
      new FileReader();

    reader.onload = async (event) => {
      try {
        const workbook =
          XLSX.read(
            event.target.result,
            {
              type: "array",
            }
          );

        const sheet =
          workbook.Sheets[
          workbook.SheetNames[0]
          ];

        const rows =
          XLSX.utils.sheet_to_json(
            sheet
          );

        const imported =
          await extractExcelWithGemini(
            rows
          );

        setItems(imported);
        setStep(3);

      } catch (err) {
        console.error(err);

        alert(
          "Unable to process Excel file."
        );
      }
    };

    reader.readAsArrayBuffer(file);
  };

  const handleConfirm = async () => {
    console.log('handleConfirm triggered', new Date().toISOString());

    if (!currentProjectId) {
      alert(
        'No project selected. Please contact your administrator.'
      );
      return;
    }

    if (isSubmitting) return;
    setIsSubmitting(true);

    setStep(5);

    try {
      const currentUserId =
        user?.id;

      const now =
        new Date().toISOString();

      for (const item of items) {
        if (
          !item.name?.trim() ||
          item.qty <= 0
        ) {
          continue;
        }

        console.log('saving item:', item.name, 'qty:', item.qty);

        // ─────────────────────────────
        // Step 1: Find product
        // ─────────────────────────────

        const {
          data: existingProducts,
          error: findErr
        } = await supabase
          .from('products')
          .select('id')
          .eq(
            'name',
            item.name.trim()
          )
          .eq(
            'project_id',
            currentProjectId
          )
          .limit(1);

        if (findErr) {
          throw findErr;
        }

        let productId;

        // ─────────────────────────────
        // Step 2: Existing product
        // ─────────────────────────────

        if (
          existingProducts &&
          existingProducts.length > 0
        ) {
          productId =
            existingProducts[0].id;

        } else {

          // ─────────────────────────────
          // Step 3: Product doesn't exist
          // ─────────────────────────────

          if (!isAdd) {
            alert(
              `Cannot deduct: "${item.name}" not found in this project's inventory.`
            );

            setIsSubmitting(false);
            setStep(3);
            return;
          }

          const {
            data: newProduct,
            error: prodErr
          } = await supabase
            .from('products')
            .insert({
              name:
                item.name.trim(),
              unit: item.unit,
              project_id:
                currentProjectId,
              category:
                'General'
            })
            .select('id')
            .single();

          if (prodErr) {
            throw prodErr;
          }

          productId =
            newProduct.id;
        }

        // ─────────────────────────────
        // Step 4: Fetch current stock
        // ─────────────────────────────

        const {
          data: stockRows
        } = await supabase
          .from('stock')
          .select(
            'current_qty, threshold'
          )
          .eq(
            'product_id',
            productId
          )
          .limit(1);

        const existingStock =
          stockRows &&
            stockRows.length > 0
            ? stockRows[0]
            : null;

        const currentQty =
          existingStock?.current_qty ??
          0;

        const threshold =
          existingStock?.threshold ??
          10;

        // ─────────────────────────────
        // ADD STOCK
        // ─────────────────────────────

        if (isAdd) {
          const { data: freshRows, error: fetchErr } = await supabase
            .from('stock')
            .select('current_qty, threshold')
            .eq('product_id', productId)
            .limit(1);

          if (fetchErr) {
            throw fetchErr;
          }

          const existing = freshRows && freshRows.length > 0 ? freshRows[0] : null;

          console.log('current db qty:', existing?.current_qty, 
                      'adding:', item.qty,
                      'result will be:', (existing?.current_qty || 0) + item.qty);

          const finalThreshold = existing?.threshold ?? 10;
          const newQty = (existing?.current_qty || 0) + item.qty;

          // ─────────────────────────────
          // Resolve active alert if stock
          // now meets or exceeds threshold
          // ─────────────────────────────

          if (newQty >= finalThreshold) {
            try {
              const { error: resolveErr } =
                await supabase
                  .from('alerts')
                  .update({ status: 'dismissed' })
                  .eq('product_id', productId)
                  .eq('project_id', currentProjectId)
                  .eq('status', 'active');

              if (resolveErr) {
                console.error(
                  'Alert resolve failed:',
                  resolveErr
                );
              }
            } catch (resolveEx) {
              console.error(
                'Alert resolve threw:',
                resolveEx
              );
            }
          }

          await supabase
            .from('transactions')
            .insert({
              product_id:
                productId,

              project_id:
                currentProjectId,

              type:
                'inward',

              qty:
                item.qty,

              bill_image_url:
                billImageUrl,

              confirmed_by:
                currentUserId,

              timestamp:
                now
            });

        } else {

          // ─────────────────────────────
          // DEDUCT STOCK
          // ─────────────────────────────

          if (
            currentQty -
            item.qty <
            0
          ) {
            alert(
              `Cannot deduct ${item.qty} of "${item.name}" — only ${currentQty} in stock.`
            );

            setIsSubmitting(false);
            setStep(3);
            return;
          }

          const newQty =
            currentQty -
            item.qty;

          // ─────────────────────────────
          // Step 7: Log transaction
          // ─────────────────────────────

          const {
            error: transactionErr
          } = await supabase
            .from('transactions')
            .insert({
              product_id:
                productId,

              project_id:
                currentProjectId,

              type:
                'outward',

              qty:
                item.qty,

              bill_image_url:
                billImageUrl,

              confirmed_by:
                currentUserId,

              timestamp:
                now
            });

          if (transactionErr) {
            console.error(
              'Transaction logging failed:',
              transactionErr
            );
          }

          // ─────────────────────────────
          // Step 8: LOW STOCK ALERT
          // ─────────────────────────────

          if (
            newQty <
            threshold
          ) {

            console.log(
              'LOW STOCK CONDITION TRIGGERED',
              {
                productId,
                projectId:
                  currentProjectId,
                currentQty:
                  newQty,
                threshold
              }
            );

            // Check if active alert already exists
            const { data: existingAlert, error: alertCheckErr } = 
              await supabase
                .from('alerts')
                .select('id')
                .eq('product_id', productId)
                .eq('project_id', currentProjectId)
                .eq('status', 'active')
                .maybeSingle()

            console.log('existing alert check:', existingAlert, alertCheckErr)

            if (!existingAlert) {
              // No active alert — create one
              const { error: alertInsertErr } = await supabase
                .from('alerts')
                .insert({
                  product_id: productId,
                  project_id: currentProjectId,
                  status: 'active',
                  triggered_at: now
                })

              if (alertInsertErr) {
                console.error('Alert insert error:', alertInsertErr)
              } else {
                console.log('New alert created, sending email...')
                
                // Send email
                const { data: emailData, error: emailErr } = 
                  await supabase.functions.invoke(
                    'send-low-stock-alert',
                    {
                      body: {
                        product_id: productId,
                        project_id: currentProjectId,
                        current_qty: newQty,
                        threshold
                      }
                    }
                  )
                
                console.log('Email function response:', emailData, emailErr)
              }
            } else {
              console.log('Alert already exists, skip email')
            }
          }
        }
      }

      // ─────────────────────────────
      // SUCCESS
      // ─────────────────────────────

      setStep(4);

      setTimeout(() => {
        navigate('/dashboard');
      }, 3000);

    } catch (err) {

      console.error(
        'Stock operation failed:',
        err
      );

      alert(
        'An error occurred while saving. Please try again.'
      );

      setIsSubmitting(false);
      setStep(3);
    }
  };

  const updateItem = (
    id,
    field,
    value
  ) => {
    setItems(
      items.map(
        item =>
          item.id === id
            ? {
              ...item,
              [field]:
                value
            }
            : item
      )
    );
  };

  const deleteItem = (id) => {
    setItems(
      items.filter(
        item =>
          item.id !== id
      )
    );
  };

  const addItem = () => {
    const newId =
      items.length > 0
        ? Math.max(
          ...items.map(
            i => i.id
          )
        ) + 1
        : 1;

    setItems([
      ...items,
      {
        id: newId,
        name: '',
        qty: 0,
        unit: 'pcs'
      }
    ]);
  };

  if (step === 1) {
    return (
      <div className="max-w-4xl mx-auto space-y-8 font-sans">
        
        {/* Centered Heading */}
        <div className="text-center max-w-xl mx-auto mt-4">
          <h1 className="text-3xl font-extrabold text-slate-900 font-heading tracking-tight">{title}</h1>
          <p className="text-slate-500 text-sm mt-2">
            Our AI-powered engine will automatically extract item names, quantities, and prices from your scanned documents to update your inventory in seconds.
          </p>
        </div>

        {/* Upload Container Box matching Screenshot 3 */}
        <div className="card p-10 bg-white border border-slate-200/80 shadow-md">
          <label className="border-dashed border-2 border-slate-200 hover:border-blue-500/50 bg-slate-50/50 hover:bg-slate-50 rounded-2xl p-10 text-center transition-all cursor-pointer group flex flex-col items-center justify-center min-h-[280px]">
            <input
              id="billUpload"
              type="file"
              className="hidden"
              accept="image/*,.pdf"
              onChange={handleFileUpload}
            />

            <input
              id="excelUpload"
              type="file"
              className="hidden"
              accept=".xlsx,.xls,.csv"
              onChange={handleExcelUpload}
            />

            <div className="w-14 h-14 bg-blue-600 rounded-full flex items-center justify-center mb-5 group-hover:scale-105 transition-transform shadow-md shadow-blue-500/10">
              <UploadCloud className="w-6 h-6 text-white" />
            </div>

            <h3 className="text-base font-bold text-slate-800 font-heading mb-1">Drop bill image here or click to upload</h3>
            <p className="text-slate-400 text-xs mb-6">Supported formats: JPG, PNG • Max size 10MB</p>

            <div className="flex flex-wrap justify-center gap-3">
              <label
                htmlFor="billUpload"
                className="btn-primary cursor-pointer inline-flex items-center justify-center gap-2 text-xs py-2 px-5"
              >
                <FileText className="w-4 h-4" />
                Scan Bill
              </label>

              <label
                htmlFor="excelUpload"
                className="btn-secondary cursor-pointer inline-flex items-center justify-center gap-2 text-xs py-2 px-5"
              >
                📊 Import Excel
              </label>
            </div>
          </label>
        </div>

        {/* Tip Cards Grid matching Screenshot 3 footer */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          
          {/* Tip 1 */}
          <div className="card p-5 bg-white flex gap-4 items-start border border-slate-200/60">
            <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
              <Lightbulb className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-800">Good Lighting</h4>
              <p className="text-[10px] text-slate-400 leading-normal mt-1">Ensure the bill is well-lit for accurate AI character recognition.</p>
            </div>
          </div>

          {/* Tip 2 */}
          <div className="card p-5 bg-white flex gap-4 items-start border border-slate-200/60">
            <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
              <Ruler className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-800">Align Straight</h4>
              <p className="text-[10px] text-slate-400 leading-normal mt-1">Place the document flat to avoid skewed text extraction.</p>
            </div>
          </div>

          {/* Tip 3 */}
          <div className="card p-5 bg-white flex gap-4 items-start border border-slate-200/60">
            <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-800">Manual Review</h4>
              <p className="text-[10px] text-slate-400 leading-normal mt-1">You can always edit detected fields before finalizing.</p>
            </div>
          </div>
        </div>

        {/* Center Footer copyright */}
        <div className="text-center py-6 border-t border-slate-100 mt-8">
          <p className="text-[10px] text-slate-400">© 2026 Vyavastha AI Logistics • Powered by NeuralCloud™ Extraction</p>
        </div>
      </div>
    );
  }

  if (step === 2 || step === 5) {
    return (
      <div className="max-w-md mx-auto flex flex-col items-center justify-center min-h-[450px] text-center font-sans">
        <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-6 shadow-sm border border-blue-100/30">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        </div>
        <h2 className="text-xl font-bold text-slate-800 font-heading">{step === 2 ? 'Gemini is reading your bill...' : 'Updating Database...'}</h2>
        <p className="text-slate-400 text-xs mt-2 max-w-[280px]">
          {step === 2 ? 'Extracting items, prices and quantities automatically with advanced AI' : 'Saving item counts and configurations to the cloud'}
        </p>
      </div>
    );
  }

  if (step === 3) {
    return (
      <div className="max-w-6xl mx-auto space-y-6 font-sans">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 font-heading tracking-tight">{confirmTitle}</h1>
            <p className="text-slate-400 text-xs mt-0.5">Please review the extracted quantities before submitting</p>
          </div>
          <button 
            onClick={addItem} 
            className="px-3.5 py-1.5 text-xs font-bold bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Add Row
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left extracted items form */}
          <div className="lg:col-span-2 space-y-4">
            <div className="card overflow-hidden">
              <div className="p-4 border-b border-slate-200/80 flex justify-between items-center bg-slate-50">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Extracted Items</h3>
                <span className="text-[10px] font-bold text-slate-400">{items.length} items detected</span>
              </div>
              <div className="p-4 max-h-[50vh] overflow-y-auto divide-y divide-slate-100">
                {items.length === 0 ? (
                  <p className="text-slate-400 text-xs text-center py-8">No items in the list. Click "Add Row" to append an item.</p>
                ) : (
                  items.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                      <div className="flex-1">
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) => updateItem(item.id, 'name', e.target.value)}
                          className="input-field py-1.5 text-xs placeholder-slate-400"
                          placeholder="Item Name"
                        />
                      </div>
                      <div className="w-24">
                        <input
                          type="number"
                          value={item.qty}
                          onChange={(e) => updateItem(item.id, 'qty', parseInt(e.target.value) || 0)}
                          className="input-field py-1.5 text-xs placeholder-slate-400 text-center"
                          placeholder="Qty"
                        />
                      </div>
                      <div className="w-24">
                        <select
                          value={item.unit}
                          onChange={(e) => updateItem(item.id, 'unit', e.target.value)}
                          className="input-field py-1.5 text-xs bg-white text-slate-800"
                        >
                          <option value="pcs">pcs</option>
                          <option value="m">m</option>
                          <option value="kg">kg</option>
                          <option value="bags">bags</option>
                        </select>
                      </div>
                      <button
                        onClick={() => deleteItem(item.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
              
              {/* Footer inside the card */}
              <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                <button 
                  onClick={() => { setBillImageUrl(null); setBillFileType(null); setStep(1); setIsSubmitting(false); }} 
                  className="btn-secondary text-xs"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={isSubmitting}
                  className="btn-primary text-xs bg-green-600 hover:bg-green-700 shadow-md shadow-green-500/10 flex items-center justify-center min-w-[120px]"
                >
                  {isSubmitting ? 'Saving...' : `Confirm & ${isAdd ? 'Add to Stock' : 'Deduct from Stock'}`}
                </button>
              </div>
            </div>
          </div>

          {/* Right bill preview panel */}
          <div className="card p-4 h-[520px] flex flex-col">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3 border-b border-slate-100 pb-2">Bill Preview</h3>
            <div className="flex-1 bg-slate-50 border border-slate-200/80 rounded-xl flex items-center justify-center relative overflow-hidden">
              {billImageUrl ? (
                billFileType === 'pdf' ? (
                  <iframe src={billImageUrl} className="w-full h-full" title="Bill PDF preview" />
                ) : (
                  <img src={billImageUrl} alt="Uploaded bill" className="w-full h-full object-contain" />
                )
              ) : (
                <div className="text-center p-6">
                  <FileText className="w-12 h-12 text-slate-300 mx-auto mb-2" />
                  <p className="text-slate-400 text-xs">No preview available</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Step 4: Success View
  return (
    <div className="max-w-md mx-auto text-center py-24 flex flex-col items-center font-sans">
      <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mb-6 border border-green-200/40 shadow-sm">
        <CheckCircle2 className="w-8 h-8 text-green-600" />
      </div>
      <h2 className="text-2xl font-bold text-slate-900 font-heading">Stock {isAdd ? 'updated' : 'deducted'} successfully!</h2>
      <p className="text-slate-400 text-xs mt-2">Redirecting you back to the dashboard...</p>
    </div>
  );
}