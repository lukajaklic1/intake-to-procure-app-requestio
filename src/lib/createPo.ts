import { supabase } from './supabase'

/** Creates a purchase order from an approved request (database function) and carries the request's attachments (offers) over
 *  to the new order as independent copies. Returns the id of the new order, or the error message. */
export async function createPoFromRequest(requestId: string, companyId: string): Promise<{ poId: string } | { error: string }> {
  const { data: poId, error } = await (supabase as any).rpc('create_po_from_request', { p_request_id: requestId })
  if (error || !poId) return { error: error?.message ?? 'Error' }
  const { data: atts } = await supabase.from('request_attachments').select('file_path, file_name, file_size').eq('request_id', requestId)
  for (let i = 0; i < (atts?.length ?? 0); i++) {
    const att = atts![i]
    const newPath = `${companyId}/${poId}/${Date.now()}-${i}-${att.file_name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const { error: cpErr } = await supabase.storage.from('quotations').copy(att.file_path, newPath)
    if (!cpErr) await supabase.from('po_attachments').insert({ po_id: poId, company_id: companyId, file_path: newPath, file_name: att.file_name, file_size: att.file_size })
  }
  return { poId: poId as string }
}
