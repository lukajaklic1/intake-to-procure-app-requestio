import { useState } from 'react'
import React from 'react'
import { pdf } from '@react-pdf/renderer'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import { toast } from '../components/ui/Toast'
import RFQDocument, { type RFQDocData } from '../components/RFQDocument'
import { unitLabel } from '../lib/units'
import { useLanguage } from './useLanguage'

/** Builds the request (PDF) of a sourcing event, addressed to one supplier or general when no supplier is given. */
export function useRFQDownload() {
  const [downloading, setDownloading] = useState(false)
  const { t, lang } = useLanguage()

  async function downloadRFQ(eventId: string, companyId: string, supplierId?: string | null) {
    setDownloading(true)
    try {
      const [{ data: ev }, { data: items }, { data: company }] = await Promise.all([
        supabase.from('sourcing_events').select('*, locations(name, address_street, address_city, address_postal_code, address_country)').eq('id', eventId).single(),
        supabase.from('sourcing_items').select('position, name, description, quantity, unit').eq('event_id', eventId).order('position'),
        supabase.from('companies').select('*').eq('id', companyId).single(),
      ])
      if (!ev || !company) { toast.error(t.common.couldNotLoadData); return }
      const supplier = supplierId ? (await supabase.from('suppliers').select('name, contact_name, email, address_street, address_city, address_postal_code, address_country').eq('id', supplierId).single()).data : null
      const owner = ev.created_by ? (await supabase.from('users').select('first_name, last_name, email, phone').eq('id', ev.created_by).single()).data : null

      const data: RFQDocData = {
        number: ev.event_number, type: ev.event_type, title: ev.title, description: ev.description, deadline: ev.deadline,
        issuedAt: ev.sent_at ?? new Date().toISOString(),
        company: {
          name: company.name, address_street: company.address_street, address_city: company.address_city, address_postal_code: company.address_postal_code,
          address_country: company.address_country, email: company.email, phone: company.phone, tax_id: company.tax_id,
          registration_number: company.registration_number, website: company.website,
        },
        supplier: supplier ?? null,
        location: (ev as unknown as { locations: RFQDocData['location'] }).locations ?? null,
        contactPerson: owner ? { name: `${owner.first_name} ${owner.last_name}`, email: (owner as { email?: string | null }).email ?? company.email, phone: (owner as { phone?: string | null }).phone ?? company.phone } : null,
        items: (items ?? []).map(i => ({ position: i.position, name: i.name, description: i.description, quantity: Number(i.quantity), unit: unitLabel(i.unit, lang) })),
      }

      let blob: Blob
      try {
        blob = await (pdf as any)(React.createElement(RFQDocument, { data, lang })).toBlob()
      } catch (pdfErr: any) {
        console.error('PDF generation error:', pdfErr)
        toast.error(t.common.pdfGenerateFailed + ': ' + (pdfErr?.message ?? String(pdfErr)))
        return
      }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const slug = supplier?.name?.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '') ?? ''
      a.href = url
      a.download = `${ev.event_number}${slug ? '_' + slug : ''}_${format(new Date(), 'yyyyMMdd')}.pdf`
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

  return { downloadRFQ, downloading }
}
