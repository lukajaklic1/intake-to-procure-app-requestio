import { useState } from 'react'
import { pdf } from '@react-pdf/renderer'
import { supabase } from '../lib/supabase'
import { toast } from '../components/ui/Toast'
import PODocument, { type PODocData } from '../components/PODocument'
import { useLanguage } from './useLanguage'
import { format } from 'date-fns'
import React from 'react'


export function usePODownload() {
  const [downloading, setDownloading] = useState(false)
  const { t, lang } = useLanguage()

  async function downloadPO(poId: string, companyId: string) {
    setDownloading(true)
    try {
      // Fetch all data in parallel
      const [
        { data: poRaw },
        { data: companyRaw },
      ] = await Promise.all([
        supabase.from('purchase_orders')
          .select('*, suppliers(*), categories(name), locations(*), departments(name)')
          .eq('id', poId).single(),
        supabase.from('companies').select('*').eq('id', companyId).single(),
      ])

      if (!poRaw || !companyRaw) { toast.error(t.common.couldNotLoadData); return }
      const po = poRaw as any
      const company = companyRaw as any

      const { data: linesRaw } = await supabase
        .from('po_line_items').select('*, items(item_number)').eq('po_id', poId).order('position')
      const lines = (linesRaw ?? []) as any[]

      const data: PODocData = {
        po_number: po.po_number,
        status: po.status,
        created_at: po.created_at,
        expected_delivery_date: po.expected_delivery_date,
        payment_terms: po.payment_terms,
        incoterm: po.incoterm,
        supplier_quote_ref: po.supplier_quote_ref,
        notes: po.notes,
        discount_amount: po.discount_amount ?? 0,
        total_amount: po.total_amount,
        currency: company.currency ?? 'EUR',
        company: {
          name: company.name,
          address_street: company.address_street,
          address_city: company.address_city,
          address_postal_code: company.address_postal_code,
          address_country: company.address_country,
          email: company.email,
          phone: company.phone,
          tax_id: company.tax_id,
          bank_name: company.bank_name,
          bank_iban: company.bank_iban,
        },
        supplier: po.suppliers as PODocData['supplier'],
        location: po.locations as PODocData['location'],
        category: po.categories as PODocData['category'],
        department: po.departments as PODocData['department'],
        lines: lines.map(l => ({
          position: l.position,
          item_number: l.items?.item_number ?? null,
          name: l.name,
          long_description: l.long_description,
          quantity: Number(l.quantity),
          unit: l.unit,
          unit_price: Number(l.unit_price),
          line_total: Number(l.line_total),
        })),
      }

      let blob: Blob
      try {
        blob = await (pdf as any)(React.createElement(PODocument, { data, lang })).toBlob()
      } catch (pdfErr: any) {
        console.error('PDF generation error:', pdfErr)
        toast.error(t.common.pdfGenerateFailed + ': ' + (pdfErr?.message ?? String(pdfErr)))
        setDownloading(false)
        return
      }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const supplierSlug = (po.suppliers as any)?.name?.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '') ?? 'supplier'
      const dateStr = format(new Date(), 'yyyyMMdd')
      a.href = url
      a.download = `${po.po_number}_${supplierSlug}_${dateStr}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      toast.success(t.common.pdfDownloaded)
    } catch (err) {
      console.error(err)
      toast.error(t.common.pdfGenerateFailed)
    } finally {
      setDownloading(false)
    }
  }

  return { downloadPO, downloading }
}
