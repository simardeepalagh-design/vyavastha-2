import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const token = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return res.status(401).json({ error: "Unauthorized" });
    const auth = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data: { user }, error: authError } = await auth.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ error: "Unauthorized" });
    const { base64, mimeType } = req.body || {};
    if (!base64 || !["image/jpeg", "image/png", "application/pdf"].includes(mimeType)) {
      return res.status(400).json({ error: "Provide a JPEG, PNG, or PDF bill." });
    }
    const model = new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel({ model: "gemini-2.5-flash" });
    const prompt = 'Read this bill carefully. Extract EVERY line item from the table. Look for columns like Material Description, UOM, Requested Qty, Issued Qty. Return ONLY a JSON array, no markdown or explanation: [{"name":"material name","qty":100,"unit":"EA"}]. Extract ALL rows. Do not skip any row.';
    const response = await model.generateContent({
      contents: [{ parts: [{ inlineData: { mimeType, data: base64 } }, { text: prompt }] }],
    });
    const text = response.response.text().replace(/```json|```/g, "").trim();
    return res.status(200).json({ items: JSON.parse(text) });
  } catch (error) {
    console.error("Bill extraction failed:", error);
    const is429 = error.status === 429 || error.statusCode === 429 || /429/.test(error.message || "");
    return res.status(is429 ? 429 : 500).json({ error: is429 ? "Gemini is busy. Please try again." : "Could not read bill. Please try again." });
  }
}
