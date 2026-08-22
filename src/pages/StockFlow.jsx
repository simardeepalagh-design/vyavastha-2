import { useState, useEffect, useContext } from 'react';
import { UploadCloud, FileText, CheckCircle2, Loader2, Plus, Trash2, Edit2 } from 'lucide-react';
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

            const {
              data: newAlert,
              error: alertErr
            } = await supabase
              .from('alerts')
              .insert({
                product_id:
                  productId,

                project_id:
                  currentProjectId,

                status:
                  'active',

                triggered_at:
                  now
              })
              .select()
              .single();

            // ─────────────────────────────
            // Existing active alert
            // ─────────────────────────────

            if (alertErr) {

              if (
                alertErr.code ===
                '23505'
              ) {

                console.log(
                  'Active low-stock alert already exists. Email will not be sent again.'
                );

              } else {

                console.error(
                  'Alert insert failed:',
                  alertErr
                );
              }

            } else if (newAlert) {

              // ─────────────────────────────
              // BRAND NEW ALERT
              // ─────────────────────────────

              console.log(
                'NEW LOW-STOCK ALERT CREATED:',
                newAlert
              );

              console.log(
                'Calling send-low-stock-alert Edge Function...'
              );

              try {

                const {
                  data: emailData,
                  error: emailErr
                } = await supabase.functions.invoke(
                  'send-low-stock-alert',
                  {
                    body: {
                      product_id:
                        productId,

                      project_id:
                        currentProjectId,

                      current_qty:
                        newQty,

                      threshold
                    }
                  }
                );

                console.log(
                  'send-low-stock-alert response:',
                  {
                    data:
                      emailData,
                    error:
                      emailErr
                  }
                );

                if (emailErr) {

                  console.error(
                    'Low-stock email failed to send:',
                    emailErr
                  );

                  console.error(
                    'Email function error details:',
                    {
                      message:
                        emailErr.message,
                      name:
                        emailErr.name,
                      context:
                        emailErr.context
                    }
                  );

                } else {

                  console.log(
                    'LOW-STOCK EMAIL FUNCTION SUCCESS:',
                    emailData
                  );

                }

              } catch (emailException) {

                console.error(
                  'Exception while invoking low-stock email function:',
                  emailException
                );

              }
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
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-6">{title}</h1>

        <label className="card p-8 md:p-12 text-center border-dashed border-2 border-border hover:border-primary/50 transition-colors cursor-pointer group block">
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
          <div className="w-16 h-16 bg-navy rounded-full flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform">
            <UploadCloud className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-xl font-medium text-white mb-2">Drop bill image here or click to upload</h3>
          <p className="text-text-muted text-sm mb-8">Supported formats: JPG • PNG • PDF • XLSX • XLS • CSV </p>

          <div className="flex justify-center gap-4">

            <label
              htmlFor="billUpload"
              className="btn-primary cursor-pointer inline-flex items-center justify-center min-w-[180px]"
            >
              <FileText className="w-5 h-5 mr-2" />
              Scan Bill
            </label>

            <label
              htmlFor="excelUpload"
              className="btn-secondary cursor-pointer inline-flex items-center justify-center min-w-[180px]"
            >
              📊 Import Excel
            </label>

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
                <button onClick={() => { setBillImageUrl(null); setBillFileType(null); setStep(1); setIsSubmitting(false); }} className="btn-secondary">Cancel</button>
                <button
                  onClick={handleConfirm}
                  disabled={isSubmitting}
                  className="btn-primary bg-success hover:bg-emerald-600 shadow-[0_0_15px_rgba(16,185,129,0.3)]"
                >
                  {isSubmitting ? 'Saving...' : `Confirm & ${isAdd ? 'Add to Stock' : 'Deduct from Stock'}`}
                </button>
              </div>
            </div>
          </div>

          <div className="card p-4 h-[500px] flex flex-col">
            <h3 className="font-semibold text-white mb-4 border-b border-border pb-3">Bill Preview</h3>
            <div className="flex-1 bg-navy border border-border rounded-lg flex items-center justify-center relative overflow-hidden">
              {billImageUrl ? (
                billFileType === 'pdf' ? (
                  <iframe src={billImageUrl} className="w-full h-full" title="Bill PDF preview" />
                ) : (
                  <img src={billImageUrl} alt="Uploaded bill" className="w-full h-full object-contain" />
                )
              ) : (
                <FileText className="w-16 h-16 text-text-muted opacity-50" />
              )}
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