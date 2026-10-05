import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { isLowStock } from '../src/services/stockStatus.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return res.status(401).json({ error: 'Authorization token required' });

  const { RESEND_API_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL, FROM_EMAIL } = process.env;
  if (!RESEND_API_KEY || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_URL || !FROM_EMAIL) {
    return res.status(500).json({ error: 'Email service is not configured' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData?.user) return res.status(401).json({ error: 'Invalid access token' });

  const { productId, projectId } = req.body || {};
  if (!productId || !projectId) return res.status(400).json({ error: 'productId and projectId are required' });

  const { data: caller, error: callerError } = await supabase
    .from('users').select('id, role, project_id').eq('id', authData.user.id).maybeSingle();
  if (callerError || !caller || !(caller.role === 'admin' || (caller.role === 'manager' && caller.project_id === projectId))) {
    return res.status(403).json({ error: 'Not authorized for this project' });
  }

  const { data: stock, error: stockError } = await supabase
    .from('stock')
    .select('id, current_qty, threshold, low_stock_alerted, products(name, unit)')
    .eq('product_id', productId).eq('project_id', projectId).maybeSingle();
  if (stockError) return res.status(500).json({ error: 'Could not fetch stock' });
  if (!stock) return res.status(404).json({ error: 'Stock item not found' });
  if (!isLowStock(stock.current_qty, stock.threshold)) return res.status(409).json({ error: 'Stock is no longer low' });
  if (stock.low_stock_alerted) return res.status(200).json({ sent: false, reason: 'already-alerted' });

  // Atomically claim the alert so retries or concurrent calls send at most one email.
  const { data: claimed, error: claimError } = await supabase
    .from('stock').update({ low_stock_alerted: true })
    .eq('id', stock.id)
    .eq('low_stock_alerted', false).eq('threshold', stock.threshold).gt('threshold', 0)
    .lte('current_qty', stock.threshold).select('id').maybeSingle();
  if (claimError) return res.status(500).json({ error: 'Could not claim alert' });
  if (!claimed) return res.status(200).json({ sent: false, reason: 'already-alerted' });

  const [adminsResult, managersResult] = await Promise.all([
    supabase.from('users').select('email').eq('role', 'admin'),
    supabase.from('users').select('email').eq('role', 'manager').eq('project_id', projectId)
  ]);
  if (adminsResult.error || managersResult.error) {
    await supabase.from('stock').update({ low_stock_alerted: false }).eq('id', stock.id).eq('low_stock_alerted', true);
    return res.status(500).json({ error: 'Could not fetch project recipients' });
  }
  const recipients = [...new Set([...adminsResult.data, ...managersResult.data].map(row => row.email).filter(Boolean))];
  if (recipients.length === 0) {
    await supabase.from('stock').update({ low_stock_alerted: false }).eq('id', stock.id).eq('low_stock_alerted', true);
    return res.status(200).json({ sent: false, reason: 'no-recipients' });
  }

  const product = Array.isArray(stock.products) ? stock.products[0] : stock.products;
  const name = product?.name || 'Inventory item';
  const unit = product?.unit ? ` ${product.unit}` : '';
  const resend = new Resend(RESEND_API_KEY);
  try {
    const { error: sendError } = await resend.emails.send({
      from: FROM_EMAIL,
      to: recipients,
      subject: `Low stock: ${name}`,
      text: `${name} is low on stock. Current quantity: ${stock.current_qty}${unit}. Threshold: ${stock.threshold}${unit}.`
    });
    if (sendError) throw sendError;
  } catch (sendError) {
    await supabase.from('stock').update({ low_stock_alerted: false }).eq('id', stock.id).eq('low_stock_alerted', true);
    return res.status(502).json({ error: 'Email could not be sent' });
  }
  return res.status(200).json({ sent: true });
}
