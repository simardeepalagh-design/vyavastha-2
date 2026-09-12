import { GoogleGenerativeAI } from "@google/generative-ai";
import { resolveItemQuantity } from "./quantityResolver";

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);

const model = genAI.getGenerativeModel({
  model: "gemini-2.5-flash",
});

export async function extractExcelWithGemini(rows, isAdd = true) {
  try {
    const prompt = `
You are an inventory extraction AI.

The following JSON was extracted from a spreadsheet.
Your job is to identify each inventory item and its fields independently regardless of column headers.

Header Semantics for Quantity Columns:
- Requested Quantity headers: Requested, Requested Qty, Ordered, Ordered Qty, Indent Qty, Demand, Demand Qty, Requisition Qty, Required Qty.
- Granted/Issued Quantity headers: Granted, Granted Qty, Issued, Issued Qty, Approved, Approved Qty, Supplied, Supplied Qty, Dispatched, Dispatched Qty, Actual Qty, Delivered Qty, Sanctioned Qty.

Rules for Quantity Columns:
1. If spreadsheet contains BOTH a Requested quantity column AND a Granted/Issued/Supplied column:
   - Extract "requested_qty" as the number under Requested/Ordered.
   - Extract "issued_qty" as the number under Granted/Issued/Supplied/Approved.
   - Set "qty" to the issued_qty value.
   - Set "qty_ambiguous" to false.
2. If spreadsheet contains ONLY ONE quantity column:
   - Set "qty" to that single number.
   - Set "requested_qty" to null and "issued_qty" to null.
   - Set "qty_ambiguous" to false.
3. If spreadsheet contains multiple numeric quantity columns but header labels are ambiguous or missing (e.g. "Qty 1", "Qty 2", or unlabeled):
   - Set "qty_ambiguous" to true.
   - Populate "requested_qty" and "issued_qty" with the extracted numbers.

Identify Unit of Measurement (UOM) columns semantically. Look for header text such as:
Unit, UOM, Uom, Unit Of Measure, Unit of Measurement, Pack, Qty Unit, Measurement, Units.

Critical UOM / Unit Rules:
1. Extract each row's unit independently from that specific row only.
2. DO NOT copy or carry over the unit from preceding or succeeding rows.
3. DO NOT substitute default units (such as "pcs").
4. If a row does not contain a unit value, set "unit" to "" (empty string).
5. DO NOT perform unit conversions. Preserve the unit string as given in the file.

Possible column names for other fields:
Item / Product Name: Item, Item Name, Material, Material Description, Description, Product, Product Name
Threshold: Threshold, Min Qty, Min Stock, Minimum Quantity, Alert Threshold

Ignore columns like: GST, Price, Rate, Amount, Vendor, Supplier, Invoice Number, Invoice Date, HSN, Remarks

Return ONLY valid JSON array.

Output format MUST be:
[
  {
    "name": "PVC Pipe",
    "requested_qty": 100,
    "issued_qty": 40,
    "qty": 40,
    "unit": "pcs",
    "threshold": 10,
    "qty_ambiguous": false
  }
]

Rules:
1. qty, requested_qty, issued_qty must be numbers or null.
2. threshold is optional; if present in the data, parse as number.
3. Do NOT include explanations.
4. Do NOT wrap JSON inside markdown.
5. Return ONLY the JSON array.

Excel Data:

${JSON.stringify(rows)}
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;

    let text = response.text();
    text = text
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    const items = JSON.parse(text);

    return items.map((item, index) => {
      const resolved = resolveItemQuantity(item, isAdd);

      return {
        id: index + 1,
        name: item.name ?? "",
        qty: resolved.qty,
        requestedQty: item.requested_qty ?? null,
        issuedQty: item.issued_qty ?? null,
        isAmbiguous: resolved.isAmbiguous,
        warningMessage: resolved.warningMessage || "",
        unit: item.unit !== undefined && item.unit !== null ? String(item.unit).trim() : "",
        threshold: item.threshold !== undefined && item.threshold !== null && item.threshold !== "" && !isNaN(Number(item.threshold)) ? Number(item.threshold) : "",
      };
    });
  } catch (err) {
    console.error(err);
    throw new Error("Unable to process Excel using Gemini.");
  }
}