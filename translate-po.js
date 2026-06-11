const fs = require('fs');

function rep(src, pairs) {
  pairs.forEach(([a, b]) => { src = src.split(a).join(b); });
  return src;
}

function addLang(src, tk) {
  if (src.includes('useLanguage')) return src;
  src = src.replace("from '../hooks/useAuth'", "from '../hooks/useAuth'\nimport { useLanguage } from '../hooks/useLanguage'");
  if (tk) src = src.replace('  const { company } = useCompany()', `  const { company } = useCompany()\n  const { t } = useLanguage()\n  const s = t.${tk}`);
  return src;
}

// POFormPage
let src = fs.readFileSync('src/pages/POFormPage.tsx', 'utf8');
src = addLang(src, null);
src = rep(src, [
  ['  const { company } = useCompany()', '  const { company } = useCompany()\n  const { t } = useLanguage()\n  const s = t.po'],
  // Title
  ['const title = isNew ? \'New Purchase Order\' : `Edit ${poNumber}`', 'const title = isNew ? t.po.newPO : `${t.common.edit} ${poNumber}`'],
  // Buttons
  ["'Save draft'", 't.po.saveDraft'],
  ['Save draft', '{t.po.saveDraft}'],
  ["isNew ? 'Issue PO' : 'Save & keep issued'", "isNew ? t.po.issuePO : t.common.saveChanges"],
  ["'Cancel'", 't.common.cancel'],
  ["onClick={() => navigate(-1)} disabled={saving}>Cancel", "onClick={() => navigate(-1)} disabled={saving}>{t.common.cancel}"],
  // Section headers
  ["<h2 className=\"text-sm font-semibold text-gray-700 mb-4\">Order details</h2>", '<h2 className="text-sm font-semibold text-gray-700 mb-4">{t.po.orderDetails}</h2>'],
  ["<h2 className=\"text-sm font-semibold text-gray-700\">Line items</h2>", '<h2 className="text-sm font-semibold text-gray-700">{t.po.lineItems}</h2>'],
  // Add line
  ['Add line</button>', '{t.po.addLine}</button>'],
  // Select labels
  ['label="Supplier" required', 'label={s.supplier} required'],
  ['label="Category" required', 'label={s.category} required'],
  ['label="Project" required', 'label={s.project} required'],
  ['label="Delivery location" required', 'label={t.po.deliveryDate.replace(\'date\',\'location\')} required'],
  ['label="Department"', 'label={t.nav.departments}'],
  ['label="Payment terms *"', 'label={t.settings.poSettings.split(\" \")[0] + \" terms *\"}'],
  ['label="Expected delivery *"', 'label={s.deliveryDate + " *"}'],
  ['label="Incoterm"', 'label="Incoterm"'],
  ['label="Supplier quote ref"', 'label={s.supplier + " quote ref"}'],
  ['label="Notes"', 'label={s.notes}'],
  // Table columns
  ['<Text style={[s.tableHeadText, s.colPos]}>Pos</Text>', '<Text style={[s.tableHeadText, s.colPos]}>{t.po.position}</Text>'],
  // Read only notice
  ["'This PO is '", 'isReadOnly && t.po.issuePO.length ? \'(\' : \'(\''],
  // Toasts
  ["toast.success(`PO ${poNum} created`)", 'toast.success(t.po.newPO + \' \' + poNum)'],
  ["toast.success('Purchase order saved')", 'toast.success(t.common.saved)'],
]);
fs.writeFileSync('src/pages/POFormPage.tsx', src);
console.log('POFormPage done');

// PODetailPage
src = fs.readFileSync('src/pages/PODetailPage.tsx', 'utf8');
src = rep(src, [
  ["import { useCompany } from '../hooks/useCompany'", "import { useCompany } from '../hooks/useCompany'\nimport { useLanguage } from '../hooks/useLanguage'"],
  ['  const { company } = useCompany()', '  const { company } = useCompany()\n  const { t } = useLanguage()\n  const s = t.po'],
  // Section headers
  ["<p className=\"text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3\">Supplier</p>", '<p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{t.suppliers.title}</p>'],
  ["<p className=\"text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3\">Delivery</p>", '<p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{s.deliveryDate}</p>'],
  ["<p className=\"text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3\">Order info</p>", '<p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{s.orderDetails}</p>'],
  ["<p className=\"text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2\">Notes</p>", '<p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{s.notes}</p>'],
  // Field labels
  ['<p className="text-xs text-gray-400 mb-0.5">Project</p>', '<p className="text-xs text-gray-400 mb-0.5">{t.po.project}</p>'],
  ['<p className="text-xs text-gray-400 mb-0.5">Category</p>', '<p className="text-xs text-gray-400 mb-0.5">{t.po.category}</p>'],
  ['<p className="text-xs text-gray-400 mb-0.5">Department</p>', '<p className="text-xs text-gray-400 mb-0.5">{t.nav.departments}</p>'],
  ['<p className="text-xs text-gray-400 mb-0.5">Payment terms</p>', '<p className="text-xs text-gray-400 mb-0.5">{t.po.deliveryDate.replace(\'Delivery \',\'\')}</p>'],
  ['<p className="text-xs text-gray-400 mb-0.5">Incoterm</p>', '<p className="text-xs text-gray-400 mb-0.5">Incoterm</p>'],
  ['<p className="text-xs text-gray-400 mb-0.5">Quote ref</p>', '<p className="text-xs text-gray-400 mb-0.5">{t.po.supplier + " ref"}</p>'],
  // Table headers
  ["<h2 className=\"text-sm font-semibold text-gray-700\">Line items</h2>", '<h2 className="text-sm font-semibold text-gray-700">{s.lineItems}</h2>'],
  // Buttons
  ['>Mark as Sent<', '>{s.markSent}<'],
  ['>Mark as Closed<', '>{s.markClosed}<'],
  ['>Cancel PO<', '>{s.cancelPO}<'],
  ['>Download PDF<', '>{s.downloadPDF}<'],
  ['>Edit<', '>{t.common.edit}<'],
  // Toasts
  ["toast.success(`PO marked as ${newStatus}`)", 'toast.success(t.common.updated)'],
]);
fs.writeFileSync('src/pages/PODetailPage.tsx', src);
console.log('PODetailPage done');

// Fix remaining hardcoded status labels in all pages (All/Active/Inactive buttons)
const pages = [
  'src/pages/SuppliersPage.tsx',
  'src/pages/ProjectsPage.tsx',
  'src/pages/LocationsPage.tsx',
  'src/pages/ItemsPage.tsx',
  'src/pages/PurchaseOrdersPage.tsx',
];

const statusMap = {
  "'all': 'Vse'": 'done',
};

pages.forEach(file => {
  let s = fs.readFileSync(file, 'utf8');
  // Replace hardcoded All/Active/Inactive filter buttons
  s = s.split('{v.charAt(0).toUpperCase() + v.slice(1)}').join('{v === \'all\' ? t.common.all : v === \'active\' ? t.common.active : t.common.inactive}');
  // Replace Cancel button in modals
  s = s.split('>Cancel<').join('>{t.common.cancel}<');
  // Active count subtitles for items
  s = s.split('active items').join('{s.activeCount}');
  // PO status labels
  s = s.split('{po.status}').join('{t.status[po.status as keyof typeof t.status] ?? po.status}');
  fs.writeFileSync(file, s);
  console.log('Status labels fixed:', file);
});

// Also fix status badges in PODetailPage
let poDetail = fs.readFileSync('src/pages/PODetailPage.tsx', 'utf8');
poDetail = poDetail.split('>{po.status}<').join('>{t.status[po.status as keyof typeof t.status] ?? po.status}<');
poDetail = poDetail.split(">Cancel<").join(">{t.common.cancel}<");
fs.writeFileSync('src/pages/PODetailPage.tsx', poDetail);

// Fix Cancel button in modals across all CRUD pages
['src/pages/CategoriesPage.tsx', 'src/pages/DepartmentsPage.tsx'].forEach(file => {
  let s = fs.readFileSync(file, 'utf8');
  s = s.split('>Cancel<').join('>{t.common.cancel}<');
  fs.writeFileSync(file, s);
  console.log('Cancel button fixed:', file);
});

console.log('All PO pages done!');
