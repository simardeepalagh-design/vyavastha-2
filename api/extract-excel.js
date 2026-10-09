import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";

const promptForRows = (rows) => `
You are an inventory extraction AI. Identify inventory items and fields independently regardless of column headers.
Quantity headers: Requested/Ordered/Indent/Demand/Required; issued headers: Granted/Issued/Approved/Supplied/Dispatched/Delivered. If both exist, use requested_qty and issued_qty and set qty to issued_qty. If one exists, use qty and null requested_qty/issued_qty. If multiple ambiguous quantity columns exist, set qty_ambiguous true and fill requested_qty and issued_qty.
Find units semantically (Unit, UOM, Pack, Measurement). Extract each row's unit independently. Never carry units between rows, invent defaults, or convert units; use "" when absent.
Possible item names: Item, Material, Description, Product. Threshold may be Min Qty/Min Stock/Minimum Quantity/Alert Threshold. Ignore GST, Price, Rate, Amount, Vendor, Invoice, HSN, Remarks.
Return only a valid JSON array. Each item: {"name":"", "requested_qty":number|null, "issued_qty":number|null, "qty":number|null, "unit":"", "threshold":number|null, "qty_ambiguous":false}. No markdown or explanation.
Data:\n${JSON.stringify(rows)}`;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const token = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return res.status(401).json({ error: "Unauthorized" });
    const auth = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data: { user }, error: authError } = await auth.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ error: "Unauthorized" });
    if (!Array.isArray(req.body?.rows)) return res.status(400).json({ error: "rows must be an array" });
    const model = new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent(promptForRows(req.body.rows));
    const text = result.response.text().replace(/```json|```/g, "").trim();
    const items = JSON.parse(text);
    return res.status(200).json({ items });
  } catch (error) {
    console.error("Excel extraction failed:", error);
    return res.status(500).json({ error: "Unable to process Excel using Gemini." });
  }
}
