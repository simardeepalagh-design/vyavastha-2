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
  Image as ImageIcon,
  AlertTriangle
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';
import { ProjectContext } from '../context/ProjectContext';
import * as XLSX from "xlsx";
import Papa from "papaparse";
import { extractExcelWithGemini } from "../services/geminiExcel";
import { resolveItemQuantity } from "../services/quantityResolver";

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

  const calculateFileHash = async (file) => {
    const arrayBuffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  };

  const checkDuplicateBill = async (file, isAdd, projectId) => {
    if (!projectId || !file) return { isDuplicate: false };

    try {
      const contentHash = await calculateFileHash(file);
      const dbTxnType = isAdd ? 'inward' : 'outward';

      const { data: existingTxns, error } = await supabase
        .from('transactions')
        .select('id, timestamp, type, bill_image_url')
        .eq('project_id', projectId)
        .eq('type', dbTxnType)
        .ilike('bill_image_url', `%${contentHash}%`)
        .limit(1);

      if (error) {
        console.error('Error checking duplicate bill:', error);
        return { isDuplicate: false, contentHash };
      }

      if (existingTxns && existingTxns.length > 0) {
        const existing = existingTxns[0];
        const txnDate = new Date(existing.timestamp).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        });
        const typeLabel = isAdd ? 'stock addition' : 'stock deduction';
        return {
          isDuplicate: true,
          message: `Duplicate Bill Detected: This bill was already uploaded for ${typeLabel} on ${txnDate}.`,
          existing,
          contentHash
        };
      }

      return { isDuplicate: false, contentHash };
    } catch (err) {
      console.error('Error in duplicate check:', err);
      return { isDuplicate: false };
    }
  };

  const uploadBillImage = async (file) => {
    if (!currentProjectId) {
      throw new Error('No project selected');
    }

    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const fileName = `${currentProjectId}/${timestamp}_${random}_${file.name}`;

    const { data, error } = await supabase.storage
      .from(BILLS_BUCKET)
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: true,
        contentType: file.type || undefined,
      });

    if (error) {
      console.error('Supabase upload error:', error);
      throw new Error(`Upload failed: ${error.message}`);
    }

    // Try public URL first
    const { data: publicData } = supabase.storage
      .from(BILLS_BUCKET)
      .getPublicUrl(fileName);

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
        .createSignedUrl(fileName, 60 * 60);

    if (signedErr) {
      console.error('Signed URL error:', signedErr);

      throw new Error(
        `Could not generate a preview URL: ${signedErr.message}`
      );
    }

    return signedData.signedUrl;
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];

    if (!file) return;

    if (!currentProjectId) {
      alert(
        'No project selected. Please contact your administrator.'
      );
      return;
    }

    const dupCheck = await checkDuplicateBill(file, isAdd, currentProjectId);

    if (dupCheck?.isDuplicate) {
      alert(dupCheck.message);
      e.target.value = '';
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
Extract every line item independently and return ONLY a JSON array, no markdown, no backticks, no explanation.

Header Semantics for Quantity Columns:
- Requested Quantity headers: Requested, Requested Qty, Ordered, Ordered Qty, Indent Qty, Demand, Demand Qty, Requisition Qty, Required Qty.
- Granted/Issued Quantity headers: Granted, Granted Qty, Issued, Issued Qty, Approved, Approved Qty, Supplied, Supplied Qty, Dispatched, Dispatched Qty, Actual Qty, Delivered Qty, Sanctioned Qty.

Quantity Extraction Rules:
1. If document contains BOTH a Requested quantity column AND a Granted/Issued/Supplied column:
   - Set "requested_qty" to the number under Requested/Ordered.
   - Set "issued_qty" to the number under Granted/Issued/Supplied/Approved.
   - Set "qty" to the issued_qty value.
   - Set "qty_ambiguous" to false.
2. If document contains ONLY ONE quantity column:
   - Set "qty" to that single number.
   - Set "requested_qty" to null and "issued_qty" to null.
   - Set "qty_ambiguous" to false.
3. If document contains multiple numeric quantity columns but header labels are ambiguous or missing (e.g. "Qty 1", "Qty 2", or unlabeled):
   - Set "qty_ambiguous" to true.
   - Populate "requested_qty" and "issued_qty" with the extracted numbers.

Critical UOM / Unit Instructions:
- Extract each item's Unit of Measurement (UOM) strictly from its own individual row.
- Look for header columns such as "Unit", "UOM", "Uom", "Unit of Measurement", "Pack", "Qty Unit", "Measure", etc., or recognize common unit values (kg, g, ltr, ml, pcs, box, dozen, pack, bag, m, etc.) present on that row.
- DO NOT carry over, infer, or copy the unit from any previous or neighboring row.
- DO NOT default or force a unit (like "pcs" or "Pcs").
- If a unit is missing, unreadable, or not present for a specific row, set "unit" to "" (empty string) for that item ONLY.
- DO NOT perform unit conversions. Preserve the unit text exactly as printed on the bill.

Schema per item:
[
  {
    "name": "product name",
    "requested_qty": 100,
    "issued_qty": 40,
    "qty": 40,
    "unit": "pcs",
    "qty_ambiguous": false
  }
]

Extract EVERY SINGLE line item from this document, no matter how many there are.
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
            (item, index) => {
              const resolved = resolveItemQuantity(item, isAdd);

              return {
                id: index + 1,
                name: item.name || '',
                qty: resolved.qty,
                requestedQty: item.requested_qty ?? null,
                issuedQty: item.issued_qty ?? null,
                isAmbiguous: resolved.isAmbiguous,
                warningMessage: resolved.warningMessage || '',
                unit: item.unit !== undefined && item.unit !== null ? String(item.unit).trim() : ''
              };
            }
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

    if (!currentProjectId) {
      alert(
        'No project selected. Please contact your administrator.'
      );
      return;
    }

    const dupCheck = await checkDuplicateBill(file, isAdd, currentProjectId);

    if (dupCheck?.isDuplicate) {
      alert(dupCheck.message);
      e.target.value = '';
      return;
    }

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
                results.data,
                isAdd
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
            rows,
            isAdd
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

        const trimmedName = item.name.trim();

        // ─────────────────────────────
        // Step 1: Find product
        // ─────────────────────────────

        const {
          data: existingProducts,
          error: findErr
        } = await supabase
          .from('products')
          .select('id')
          .ilike(
            'name',
            trimmedName
          )
          .eq(
            'project_id',
            currentProjectId
          )
          .limit(1);

        if (findErr) {
          console.error('Error finding product:', findErr);
        }

        let productId = existingProducts?.[0]?.id;

        // ─────────────────────────────
        // Step 2: Product exists or needs insert
        // ─────────────────────────────

        if (productId) {
          // Product already exists: silently use existing product_id
          console.log(`Product "${trimmedName}" exists (id: ${productId}). Reusing product silently.`);
        } else {
          // Product does not exist
          if (!isAdd) {
            alert(
              `Cannot deduct: "${trimmedName}" not found in this project's inventory.`
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
              name: trimmedName,
              unit: item.unit || '',
              project_id: currentProjectId,
              category: 'General'
            })
            .select('id')
            .single();

          if (prodErr) {
            // In case of conflict/race condition where product was inserted, fetch existing product
            console.warn('Product insert error or conflict, checking existing product:', prodErr);
            const { data: retryProd } = await supabase
              .from('products')
              .select('id')
              .ilike('name', trimmedName)
              .eq('project_id', currentProjectId)
              .maybeSingle();

            if (retryProd?.id) {
              productId = retryProd.id;
            } else {
              throw prodErr;
            }
          } else {
            productId = newProduct.id;
          }
        }

        // ─────────────────────────────
        // Step 3: Fetch current stock
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
          .eq(
            'project_id',
            currentProjectId
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

        const activeThreshold = existingStock?.threshold ?? 10;

        // ─────────────────────────────
        // ADD STOCK
        // ─────────────────────────────

        if (isAdd) {
          const newQty = currentQty + item.qty;

          console.log('current db qty:', currentQty, 
                      'adding:', item.qty,
                      'result will be:', newQty);

          // Update or insert stock table
          if (existingStock) {
            // When stock row already EXISTS:
            // Only update current_qty and last_updated
            // NEVER touch threshold
            const { error: stUpdateErr } = await supabase
              .from('stock')
              .update({
                current_qty: newQty,
                last_updated: now
              })
              .eq('product_id', productId)
              .eq('project_id', currentProjectId);

            if (stUpdateErr) throw stUpdateErr;
          } else {
            // When stock row does NOT exist (first time):
            // Set threshold with default value of 10
            const { error: stInsertErr } = await supabase
              .from('stock')
              .insert({
                product_id: productId,
                project_id: currentProjectId,
                current_qty: item.qty,
                threshold: 10,
                last_updated: now
              });

            if (stInsertErr) throw stInsertErr;
          }

          // ─────────────────────────────
          // Resolve active alert if stock
          // now meets or exceeds threshold
          // ─────────────────────────────

          if (newQty >= activeThreshold) {
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

          const newQty = currentQty - item.qty;

          if (existingStock) {
            const { error: stDeductErr } = await supabase
              .from('stock')
              .update({
                current_qty: newQty,
                last_updated: now
              })
              .eq('product_id', productId)
              .eq('project_id', currentProjectId);

            if (stDeductErr) throw stDeductErr;
          }

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
            activeThreshold
          ) {

            console.log(
              'LOW STOCK CONDITION TRIGGERED',
              {
                productId,
                projectId:
                  currentProjectId,
                currentQty:
                  newQty,
                threshold: activeThreshold
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
                        threshold: activeThreshold
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
            <p className="text-slate-400 text-xs mt-0.5">Please review the extracted items, quantities, and units before submitting</p>
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
                <div className="flex items-center gap-3">
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Extracted Items Review</h3>
                  <span className="text-[10px] font-bold text-slate-400">{items.length} items detected</span>
                </div>
                {items.length > 0 && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setItems(items.map(i => ({ ...i, price: '' })))}
                      className="text-[10px] font-semibold text-slate-500 hover:text-red-600 hover:underline cursor-pointer"
                      title="Clear price column for all items"
                    >
                      Clear Prices
                    </button>
                  </div>
                )}
              </div>

              {items.length > 0 && (
                <div className="px-4 py-2 bg-slate-100/60 border-b border-slate-200/60 flex items-center gap-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  <div className="flex-1">Item Name</div>
                  <div className="w-24 text-center">Qty</div>
                  <div className="w-28 text-center">Unit (UOM)</div>
                  <div className="w-24 text-center">Price (₹)</div>
                  <div className="w-8"></div>
                </div>
              )}

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
                          className={`input-field py-1.5 text-xs placeholder-slate-400 text-center ${item.isAmbiguous ? 'border-amber-500 bg-amber-50/40 text-amber-900 font-bold focus:ring-amber-500' : ''}`}
                          placeholder="Qty"
                        />
                        {item.isAmbiguous && (
                          <span className="flex items-center justify-center gap-0.5 text-[9px] font-bold text-amber-700 mt-0.5" title={item.warningMessage || "Ambiguous quantity headers detected on bill. Please verify."}>
                            <AlertTriangle className="w-2.5 h-2.5 text-amber-600 shrink-0" /> Verify Qty
                          </span>
                        )}
                        {!isAdd && item.requestedQty !== null && item.issuedQty !== null && item.requestedQty !== item.issuedQty && !item.isAmbiguous && (
                          <span className="block text-[8px] font-semibold text-slate-400 mt-0.5 text-center" title={`Requested: ${item.requestedQty}, Issued: ${item.issuedQty}`}>
                            Req:{item.requestedQty} → Iss:{item.issuedQty}
                          </span>
                        )}
                      </div>
                      <div className="w-28 relative">
                        <input
                          type="text"
                          list="unit-suggestions"
                          value={item.unit ?? ''}
                          onChange={(e) => updateItem(item.id, 'unit', e.target.value)}
                          className={`input-field py-1.5 text-xs placeholder-slate-400 text-center font-medium ${
                            !item.unit || item.unit.trim() === '' ? 'border-amber-400 bg-amber-50/50 text-amber-900 focus:ring-amber-500 font-bold' : ''
                          }`}
                          placeholder="Unit"
                          title="Unit of measurement"
                        />
                        {(!item.unit || item.unit.trim() === '') && (
                          <span className="flex items-center justify-center gap-0.5 text-[9px] font-bold text-amber-700 mt-0.5" title="Missing UOM - Please specify unit">
                            <AlertTriangle className="w-2.5 h-2.5 text-amber-600 shrink-0" /> Missing UOM
                          </span>
                        )}
                        <datalist id="unit-suggestions">
                          <option value="pcs" />
                          <option value="kg" />
                          <option value="g" />
                          <option value="ltr" />
                          <option value="ml" />
                          <option value="box" />
                          <option value="pack" />
                          <option value="bag" />
                          <option value="m" />
                          <option value="dozen" />
                        </datalist>
                      </div>
                      <div className="w-24">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.price ?? ''}
                          onChange={(e) => updateItem(item.id, 'price', e.target.value === '' ? '' : Number(e.target.value))}
                          className="input-field py-1.5 text-xs placeholder-slate-400 text-center"
                          placeholder="Price"
                          title="Price per unit"
                        />
                      </div>
                      <button
                        onClick={() => deleteItem(item.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer w-8 shrink-0"
                        title="Delete item row"
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