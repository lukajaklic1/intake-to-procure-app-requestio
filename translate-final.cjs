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
]);

// ── DepartmentsPage ──
rep('src/pages/DepartmentsPage.tsx', [
  ["toast.error('Name is required')", "toast.error(t.common.nameRequired)"],
  ['title="Delete department" danger', 'title={t.common.confirmDeleteTitle} danger'],
  ['confirmLabel="Delete"', 'confirmLabel={t.common.delete}'],
  ['>Name</th>', '>{t.common.name}</th>'],
  ['>Created</th>', '>{t.common.created}</th>'],
  ['>Cancel<', '>{t.common.cancel}<'],
]);

// ── ItemsPage ──
rep('src/pages/ItemsPage.tsx', [
  ["toast.error('Name is required')", "toast.error(t.common.nameRequired)"],
  ["['Item no.', 'Name', 'Category', 'Unit', 'Status', '']", "[s.itemNumber, t.common.name, t.categories.title, s.defaultUnit, t.common.status, '']"],
  ['<option value="">No category</option>', '<option value="">{s.allCategories}</option>'],
  ['title="Delete item" danger', 'title={t.common.confirmDeleteTitle} danger'],
  ['confirmLabel="Delete"', 'confirmLabel={t.common.delete}'],
  ['>Cancel<', '>{t.common.cancel}<'],
]);

// ── LocationsPage ──
rep('src/pages/LocationsPage.tsx', [
  ["toast.error('Name is required')", "toast.error(t.common.nameRequired)"],
  ["['Name', 'City', 'Country', 'Status', '']", "[t.common.name, t.common.city, t.common.country, t.common.status, '']"],
  ['title="Delete location" danger', 'title={t.common.confirmDeleteTitle} danger'],
  ['confirmLabel="Delete"', 'confirmLabel={t.common.delete}'],
  ['>Cancel<', '>{t.common.cancel}<'],
]);

// ── ProjectsPage ──
rep('src/pages/ProjectsPage.tsx', [
  ["toast.error('Name is required')", "toast.error(t.common.nameRequired)"],
  ["['Name', 'Code', 'Customer', 'Start', 'End', 'Status', '']", "[t.common.name, s.projectCode, s.customer, s.startDate, s.endDate, t.common.status, '']"],
  ['title="Delete project" danger', 'title={t.common.confirmDeleteTitle} danger'],
  ['confirmLabel="Delete"', 'confirmLabel={t.common.delete}'],
  ['>Cancel<', '>{t.common.cancel}<'],
]);

// ── SuppliersPage ──
rep('src/pages/SuppliersPage.tsx', [
  ["toast.error('Name is required')", "toast.error(t.common.nameRequired)"],
  ['title="Delete supplier" danger', 'title={t.common.confirmDeleteTitle} danger'],
  ['confirmLabel="Delete"', 'confirmLabel={t.common.delete}'],
  ['>Cancel<', '>{t.common.cancel}<'],
]);

// ── PurchaseOrdersPage ──
rep('src/pages/PurchaseOrdersPage.tsx', [
  ['"All time"', 't.filters.allTime'],
  ['"Last month"', 't.filters.lastMonth'],
  ['"Last 3 months"', 't.filters.last3Months'],
  ['"Last 6 months"', 't.filters.last6Months'],
  ['"Last 12 months"', 't.filters.last12Months'],
  ['confirmLabel="Delete"', 'confirmLabel={t.common.delete}'],
  ['title="Cancel purchase order"', 'title={t.po.cancelPO}'],
  ['title="Delete draft PO"', 'title={t.common.confirmDeleteTitle}'],
  ["v === 'all' ? t.common.all : v === 'active' ? t.common.active : t.common.inactive",
   "v === 'all' ? t.common.all : v === 'draft' ? t.status.draft : v === 'issued' ? t.status.issued : v === 'sent' ? t.status.sent : v === 'closed' ? t.status.closed : t.status.cancelled"],
]);

// ── POFormPage ──
rep('src/pages/POFormPage.tsx', [
  ["toast.error('PO not found')", "toast.error(t.po.title + ' ni najdeno')"],
  ["toast.error('Supplier is required')", "toast.error(t.common.nameRequired)"],
  ["toast.error('Category is required')", "toast.error(t.common.nameRequired)"],
  ["toast.error('Project is required')", "toast.error(t.common.nameRequired)"],
  ["toast.error('Location is required')", "toast.error(t.common.nameRequired)"],
  ["toast.error('Payment terms are required')", "toast.error(t.common.nameRequired)"],
  ["toast.error('Expected delivery date is required')", "toast.error(t.common.nameRequired)"],
  ["toast.error('Add at least one line item')", "toast.error(t.po.lineItems)"],
  ["toast.error(poErr?.message ?? 'Failed to create PO')", "toast.error(poErr?.message ?? t.common.nameRequired)"],
  ['placeholder="Search catalog…"', 'placeholder={t.items.title}'],
  ['placeholder="Item name *"', 'placeholder={t.common.name}'],
  ['"Notes for the supplier…"', 't.po.notes'],
]);

// ── PODetailPage ──
rep('src/pages/PODetailPage.tsx', [
  ["{ label: 'Mark as Sent', status: 'sent' }", "{ label: t.po.markSent, status: 'sent' }"],
  ["{ label: 'Mark as Closed', status: 'closed' }", "{ label: t.po.markClosed, status: 'closed' }"],
  [">Mark as Sent<", ">{t.po.markSent}<"],
  [">Mark as Closed<", ">{t.po.markClosed}<"],
  [">Cancel PO<", ">{t.po.cancelPO}<"],
  [">Download PDF<", ">{t.po.downloadPDF}<"],
  ["confirmLabel={confirmTransition?.label ?? 'Confirm'}", "confirmLabel={confirmTransition?.label ?? t.common.save}"],
  ['title="Cancel purchase order"', 'title={t.po.cancelPO}'],
]);

// ── DashboardPage ──
rep('src/pages/DashboardPage.tsx', [
  ["'Unknown'", "'Neznano'"],
  ["'Uncategorized'", "'Brez kategorije'"],
  ["'No project'", "'Brez projekta'"],
  ["'No department'", "'Brez oddelka'"],
]);

// ── LandingPage ──
rep('src/pages/LandingPage.tsx', [
  ["['Dashboard','Purchase Orders','Suppliers','Items','Categories','Projects']",
   "[t.nav.dashboard,t.nav.purchaseOrders,t.nav.suppliers,t.nav.items,t.nav.categories,t.nav.projects]"],
]);

// ── PDF Document ──
rep('src/components/PODocument.tsx', [
  ['"SUPPLIER"', '"DOBAVITELJ"'],
  ['"DELIVERY TO"', '"DOSTAVA DO"'],
  ['>Description<', '>Opis<'],
  ['>Qty<', '>Kol.<'],
  ['>Amount<', '>Znesek<'],
  ['>Unit price<', '>Cena/EM<'],
  ['>Unit<', '>EM<'],
  ['Total ex. VAT', 'Skupaj brez DDV'],
  ['"NOTES"', '"OPOMBE"'],
  ['"DELIVERY INSTRUCTIONS"', '"NAVODILA ZA DOSTAVO"'],
  ['"Page "', '"Stran "'],
  ['" / "', '" od "'],
  ['"Expected delivery"', '"Pričakovana dostava"'],
  ['"PO Date"', '"Datum NO"'],
  ['"Date"', '"Datum"'],
  ['Purchase Order', 'Naročilo'],
  ['PURCHASE ORDER', 'NAROČILO'],
  ['"VAT: "', '"DDV: "'],
  ['"Bank: "', '"Banka: "'],
  ['"Project"', '"Projekt"'],
  ['"Category"', '"Kategorija"'],
  ['"Department"', '"Oddelek"'],
  ['"Payment terms"', '"Plačilni pogoj"'],
  ['"Incoterm"', '"Pariteta"'],
  ['"Quote reference"', '"Referenca ponudbe"'],
  ['"SUPPLIER"', '"DOBAVITELJ"'],
  ['"DELIVERY TO"', '"DOSTAVA DO"'],
]);

console.log('\nVSE NAREJENO!');
