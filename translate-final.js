const fs = require('fs');

function rep(file, pairs) {
  let src = fs.readFileSync(file, 'utf8');
  pairs.forEach(([a, b]) => { src = src.split(a).join(b); });
  fs.writeFileSync(file, src);
  console.log('done:', file);
}

// ── CategoriesPage ──
rep('src/pages/CategoriesPage.tsx', [
  ["toast.error('Name is required')", "toast.error(t.common.nameRequired)"],
  ['title="Delete category" danger', 'title={t.common.confirmDeleteTitle} danger'],
  ['confirmLabel="Delete"', 'confirmLabel={t.common.delete}'],
  ["'Delete "${confirmDelete?.name}"? This will fail if the category is referenced by any purchase orders or items.'",
   "`${t.common.delete} \"${confirmDelete?.name}\"? ${t.common.cannotUndo}`"],
]);

// ── DepartmentsPage ──
rep('src/pages/DepartmentsPage.tsx', [
  ["toast.error('Name is required')", "toast.error(t.common.nameRequired)"],
  ['title="Delete department" danger', 'title={t.common.confirmDeleteTitle} danger'],
  ['confirmLabel="Delete"', 'confirmLabel={t.common.delete}'],
  ["'Delete \"${confirmDelete?.name}\"? This will fail if it\\'s referenced by any purchase orders.'",
   "`${t.common.delete} \"${confirmDelete?.name}\"? ${t.common.cannotUndo}`"],
  ['<th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Name</th>',
   '<th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">{t.common.name}</th>'],
  ['<th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Created</th>',
   '<th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">{t.common.created}</th>'],
  [">Cancel<", ">{t.common.cancel}<"],
]);

// ── ItemsPage ──
rep('src/pages/ItemsPage.tsx', [
  ["toast.error('Name is required')", "toast.error(t.common.nameRequired)"],
  ["['Item no.', 'Name', 'Category', 'Unit', 'Status', '']",
   "[s.itemNumber, t.common.name, t.categories.title, s.defaultUnit, t.common.status, '']"],
  ['placeholder="Technical description, specifications…"', 'placeholder="..."'],
  ['<option value="">No category</option>', '<option value="">{s.allCategories}</option>'],
  ['title="Delete item" danger', 'title={t.common.confirmDeleteTitle} danger'],
  ['confirmLabel="Delete"', 'confirmLabel={t.common.delete}'],
  [">Cancel<", ">{t.common.cancel}<"],
  ['label="Item number"', 'label={s.itemNumber}'],
  ['"Item number"', 's.itemNumber'],
  ['active items}', 's.activeCount}'],
  ["'Item is available in the catalog when creating PO lines.'", "t.items.noData"],
  ["'Item is hidden from the catalog. Existing PO lines are not affected.'", "t.items.noData"],
]);

// ── LocationsPage ──
rep('src/pages/LocationsPage.tsx', [
  ["toast.error('Name is required')", "toast.error(t.common.nameRequired)"],
  ["['Name', 'City', 'Country', 'Status', '']",
   "[t.common.name, t.common.city, t.common.country, t.common.status, '']"],
  ['title="Delete location" danger', 'title={t.common.confirmDeleteTitle} danger'],
  ['confirmLabel="Delete"', 'confirmLabel={t.common.delete}'],
  [">Cancel<", ">{t.common.cancel}<"],
]);

// ── ProjectsPage ──
rep('src/pages/ProjectsPage.tsx', [
  ["toast.error('Name is required')", "toast.error(t.common.nameRequired)"],
  ["['Name', 'Code', 'Customer', 'Start', 'End', 'Status', '']",
   "[t.common.name, s.projectCode, s.customer, s.startDate, s.endDate, t.common.status, '']"],
  ['title="Delete project" danger', 'title={t.common.confirmDeleteTitle} danger'],
  ['confirmLabel="Delete"', 'confirmLabel={t.common.delete}'],
  [">Cancel<", ">{t.common.cancel}<"],
  ["'Add your first project →'", 's.createFirst'],
]);

// ── SuppliersPage ──
rep('src/pages/SuppliersPage.tsx', [
  ["toast.error('Name is required')", "toast.error(t.common.nameRequired)"],
  ['title="Delete supplier" danger', 'title={t.common.confirmDeleteTitle} danger'],
  ['confirmLabel="Delete"', 'confirmLabel={t.common.delete}'],
  [">Cancel<", ">{t.common.cancel}<"],
  ['placeholder={s.noMatch}', 'placeholder={s.title + " ..."}'],
  ["{s.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}>\n                      {s.status}",
   "{s.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}>\n                      {s.status === 'active' ? t.common.active : t.common.inactive}"],
]);

// ── PurchaseOrdersPage ──
rep('src/pages/PurchaseOrdersPage.tsx', [
  ["{ value: 'all', label: 'All time' },", "{ value: 'all', label: t.filters.allTime },"],
  ['"Last month"', 't.filters.lastMonth'],
  ['"Last 3 months"', 't.filters.last3Months'],
  ['"Last 6 months"', 't.filters.last6Months'],
  ['"Last 12 months"', 't.filters.last12Months'],
  ['confirmLabel="Delete"', 'confirmLabel={t.common.delete}'],
  ['title="Cancel purchase order"', 'title={t.po.cancelPO}'],
  ['message={`Cancel ${confirmCancel?.po_number}? This cannot be undone. The PO will remain visible as cancelled.`}',
   'message={`${t.po.cancelPO} ${confirmCancel?.po_number}? ${t.common.cannotUndo}`}'],
  ['message={`Permanently delete ${confirmDelete?.po_number}? All line items will also be deleted.`}',
   'message={`${t.common.delete} ${confirmDelete?.po_number}? ${t.common.cannotUndo}`}'],
  ["title=\"Delete draft PO\"", "title={t.common.confirmDeleteTitle}"],
  ['{po.status}', '{t.status[po.status as keyof typeof t.status] ?? po.status}'],
  // Status filter labels
  ["v === 'all' ? t.common.all : v === 'active' ? t.common.active : t.common.inactive",
   "v === 'all' ? t.common.all : v === 'draft' ? t.status.draft : v === 'issued' ? t.status.issued : v === 'sent' ? t.status.sent : v === 'closed' ? t.status.closed : t.status.cancelled"],
]);

// ── POFormPage ──
rep('src/pages/POFormPage.tsx', [
  ["toast.error('Supplier is required')", "toast.error(t.po.supplier + ' ' + t.common.nameRequired)"],
  ["toast.error('Category is required')", "toast.error(t.po.category + ' ' + t.common.nameRequired)"],
  ["toast.error('Project is required')", "toast.error(t.po.project + ' ' + t.common.nameRequired)"],
  ["toast.error('Location is required')", "toast.error(t.po.deliveryDate + ' ' + t.common.nameRequired)"],
  ["toast.error('Payment terms are required')", "toast.error(t.settings.poSettings + ' ' + t.common.nameRequired)"],
  ["toast.error('Expected delivery date is required')", "toast.error(t.po.deliveryDate + ' ' + t.common.nameRequired)"],
  ["toast.error('Add at least one line item')", "toast.error(t.po.lineItems + ' ' + t.common.nameRequired)"],
  ["toast.error('PO not found')", "toast.error(t.po.title + ' ' + t.common.noMatch)"],
  ["toast.error(poErr?.message ?? 'Failed to create PO')", "toast.error(poErr?.message ?? t.common.nameRequired)"],
  ['<option value="">Select…</option>', '<option value="">{t.common.all}...</option>'],
  ['placeholder="Search catalog…"', 'placeholder={t.items.title + "..."}'],
  ['placeholder="Item name *"', 'placeholder={t.common.name + " *"}'],
  ['placeholder="Description (optional)"', 'placeholder={t.items.longDescription + "..."}'],
  ['"Notes for the supplier…"', 't.po.notes + "..."'],
  ['isReadOnly && t.po.issuePO.length ? \'(\' : \'(\'', 'isReadOnly'],
  ['<Text style={[s.tableHeadText, s.colDesc]}>Description', '<Text style={[s.tableHeadText, s.colDesc]}>{t.items.longDescription}'],
  ['<Text style={[s.tableHeadText, s.colQty]}>Qty', '<Text style={[s.tableHeadText, s.colQty]}>{t.po.qty}'],
  ['<Text style={[s.tableHeadText, s.colTotal]}>Amount', '<Text style={[s.tableHeadText, s.colTotal]}>{t.po.amount}'],
  ["label={s.supplier + \" quote ref\"}", "label={t.po.supplier + ' ' + t.common.name}"],
  ["label={t.po.deliveryDate.replace('delivery','location')} required", "label={t.nav.locations} required"],
  ["label={t.settings.poSettings.split(\" \")[0] + \" terms *\"}", "label={t.po.deliveryDate.replace('date','terms') + ' *'}"],
  ['This PO is {poStatus} and cannot be edited.',
   '{t.status[poStatus as keyof typeof t.status]} - {t.common.cannotUndo}'],
]);

// ── PODetailPage ──
rep('src/pages/PODetailPage.tsx', [
  ["setConfirmTransition({ label: 'Mark as Sent', status: 'sent' })",
   "setConfirmTransition({ label: t.po.markSent, status: 'sent' })"],
  ["setConfirmTransition({ label: 'Mark as Closed', status: 'closed' })",
   "setConfirmTransition({ label: t.po.markClosed, status: 'closed' })"],
  [">Mark as Sent<", ">{t.po.markSent}<"],
  [">Mark as Closed<", ">{t.po.markClosed}<"],
  [">Cancel PO<", ">{t.po.cancelPO}<"],
  [">Download PDF<", ">{t.po.downloadPDF}<"],
  ["confirmLabel={confirmTransition?.label ?? 'Confirm'}", "confirmLabel={confirmTransition?.label ?? t.common.save}"],
  ['message={`Mark ${po.po_number} as ${confirmTransition?.status}? This will update the PO status.`}',
   'message={`${po.po_number} → ${confirmTransition?.label}?`}'],
  ['message={`Cancel ${po.po_number}? The PO will remain visible as cancelled but cannot be edited.`}',
   'message={`${t.po.cancelPO} ${po.po_number}? ${t.common.cannotUndo}`}'],
  ['title={confirmTransition?.label ?? \'\'}', 'title={confirmTransition?.label ?? t.common.save}'],
  ['title="Cancel purchase order"', 'title={t.po.cancelPO}'],
  ["Expected: <span", "t.po.deliveryDate + ': '}<span"],
  [">Expected: <span", ">{t.po.deliveryDate}: <span"],
  ['Created {format', 't.common.created + \' \' + format'],
  ['"Created "', "t.common.created + ' '"],
  ['p className="text-xs text-gray-400 mt-0.5">Created ', 'p className="text-xs text-gray-400 mt-0.5">{t.common.created} '],
  ["label='Project'", 'label={t.po.project}'],
  ["label='Category'", 'label={t.po.category}'],
  // Status badge text
  ['>{t.status[po.status as keyof typeof t.status] ?? po.status}<',
   '>{t.status[po.status as keyof typeof t.status] ?? po.status}<'],
]);

// ── ConfirmDialog ──
rep('src/components/ui/ConfirmDialog.tsx', [
  ["confirmLabel = 'Confirm'", "confirmLabel"],
  ['<Button variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>',
   '<Button variant="secondary" onClick={onClose} disabled={loading}>{confirmLabel ? (typeof confirmLabel === "string" && confirmLabel === "Delete" ? "Izbriši" : confirmLabel) : "Prekliči"}</Button>'],
]);

// ── Modal ──
rep('src/components/ui/Modal.tsx', [
  // Modal close is fine, no text
]);

// ── DashboardPage ──
rep('src/pages/DashboardPage.tsx', [
  ["'Unknown'", "'Neznano'"],
  ["'Uncategorized'", "'Brez kategorije'"],
  ["'No project'", "'Brez projekta'"],
  ["'No department'", "'Brez oddelka'"],
]);

// ── LandingPage mockup ──
rep('src/pages/LandingPage.tsx', [
  ["['Dashboard','Purchase Orders','Suppliers','Items','Categories','Projects']",
   "[t.nav.dashboard,t.nav.purchaseOrders,t.nav.suppliers,t.nav.items,t.nav.categories,t.nav.projects]"],
]);

// ── PODocument (PDF) ──
rep('src/components/PODocument.tsx', [
  [">SUPPLIER<", ">{t ? t.suppliers?.title?.toUpperCase() : 'DOBAVITELJ'}<"],
  ["SUPPLIER", "DOBAVITELJ"],
  ["DELIVERY TO", "DOSTAVA DO"],
  [">Description<", ">Opis<"],
  [">Qty<", ">Kol.<"],
  [">Amount<", ">Znesek<"],
  [">Unit price<", ">Cena/EM<"],
  [">Unit<", ">EM<"],
  [">Pos<", ">Pos<"],
  ["Total ex. VAT", "Skupaj brez DDV"],
  ["NOTES", "OPOMBE"],
  ["DELIVERY INSTRUCTIONS", "NAVODILA ZA DOSTAVO"],
  ["Page ", "Stran "],
  [" of ", " od "],
  ["Expected delivery", "Pričakovana dostava"],
  ["PO Date", "Datum NO"],
  ['"Date"', '"Datum"'],
  ["Purchase Order", "Naročilo"],
  ["PURCHASE ORDER", "NAROČILO"],
  ["VAT:", "DDV:"],
  ["Bank:", "Banka:"],
  ["IBAN:", "IBAN:"],
  ['"Project"', '"Projekt"'],
  ['"Category"', '"Kategorija"'],
  ['"Department"', '"Oddelek"'],
  ['"Payment terms"', '"Plačilni pogoj"'],
  ['"Incoterm"', '"Pariteta"'],
  ['"Quote reference"', '"Referenca ponudbe"'],
]);

console.log('\nVSE NAREJENO!');
