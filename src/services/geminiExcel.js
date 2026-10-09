import { resolveItemQuantity } from "./quantityResolver";
import { supabase } from "../supabase";

export async function extractExcelWithGemini(rows, isAdd = true) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Please sign in again before importing.");

  const response = await fetch("/api/extract-excel", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ rows, isAdd }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Unable to process Excel using Gemini.");

  return (Array.isArray(payload.items) ? payload.items : []).map((item, index) => {
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
}
