const fs = require('fs');

function addLang(src, tk) {
  if (src.includes('useLanguage')) return src;
  src = src.replace("from '../types/database'", "from '../types/database'\nimport { useLanguage } from '../hooks/useLanguage'");
  src = src.replace('  const { company } = useCompany()', `  const { company } = useCompany()\n  const { t } = useLanguage()\n  const s = t.${tk}`);
  return src;
}

function rep(src, pairs) {
  pairs.forEach(([a, b]) => { src = src.split(a).join(b); });
  return src;
}

// Categories
let src = addLang(fs.readFileSync('src/pages/CategoriesPage.tsx', 'utf8'), 'categories');
src = rep(src, [
  ['<h1 className="text-2xl font-bold text-gray-900">Categories</h1>', '<h1 className="text-2xl font-bold text-gray-900">{s.title}</h1>'],
  ['{categories.length} categories', '{categories.length} {s.count}'],
  ['<Plus className="w-4 h-4" />New Category', '<Plus className="w-4 h-4" />{s.new}'],
  ['placeholder="Search categories…"', 'placeholder={s.title}'],
  ["'No categories match your search'", 's.noMatch'],
  ["'No categories yet'", 's.noData'],
  ["'Add your first category →'", 's.createFirst'],
  ["editing.id ? 'Edit Category' : 'New Category'", "editing.id ? t.categories.title : s.new"],
  ['label="Category name *"', 'label={s.categoryName + " *"}'],
  ["editing.id ? 'Save changes' : 'Create'", "editing.id ? t.common.saveChanges : t.common.create"],
  ["toast.success('Category updated')", 'toast.success(t.common.saved)'],
  ["toast.success('Category created')", 'toast.success(t.common.saved)'],
  ["toast.success('Category deleted')", 'toast.success(t.common.deleted)'],
]);
fs.writeFileSync('src/pages/CategoriesPage.tsx', src);
console.log('Categories done');

// Projects
src = addLang(fs.readFileSync('src/pages/ProjectsPage.tsx', 'utf8'), 'projects');
src = rep(src, [
  ['<h1 className="text-2xl font-bold text-gray-900">Projects</h1>', '<h1 className="text-2xl font-bold text-gray-900">{s.title}</h1>'],
  ['{projects.filter(p => p.status === \'active\').length} active projects', '{projects.filter(p => p.status === \'active\').length} {s.activeCount}'],
  ['<Plus className="w-4 h-4" />New Project', '<Plus className="w-4 h-4" />{s.new}'],
  ['placeholder="Search projects…"', 'placeholder={s.title}'],
  ["'No projects match your search'", 's.noMatch'],
  ["'No projects yet'", 's.noData'],
  ["'Add your first project →'", 's.createFirst'],
  ["editing.id ? 'Edit Project' : 'New Project'", "editing.id ? t.common.saveChanges : s.new"],
  ['label="Project name *"', 'label={s.projectName + " *"}'],
  ['label="Project code"', 'label={s.projectCode}'],
  ['label="Customer"', 'label={s.customer}'],
  ['label="Start date"', 'label={s.startDate}'],
  ['label="End date"', 'label={s.endDate}'],
  ["editing.status === 'active' ? '✓ Active' : '✗ Inactive'", "editing.status === 'active' ? t.common.statusActive : t.common.statusInactive"],
  ["'Project is visible and can be selected on new POs.'", "s.statusHelp"],
  ["'Project is hidden from all PO dropdowns. Existing POs are not affected.'", "s.statusHelp"],
  ["editing.id ? 'Save changes' : 'Create project'", "editing.id ? t.common.saveChanges : s.new"],
  ["toast.success('Project updated')", 'toast.success(t.common.saved)'],
  ["toast.success('Project created')", 'toast.success(t.common.saved)'],
  ["toast.success('Project deleted')", 'toast.success(t.common.deleted)'],
  ["toast.success('Project deactivated')", 'toast.success(t.common.deactivated)'],
  ["toast.success('Project activated')", 'toast.success(t.common.activated)'],
]);
fs.writeFileSync('src/pages/ProjectsPage.tsx', src);
console.log('Projects done');

// Locations
src = addLang(fs.readFileSync('src/pages/LocationsPage.tsx', 'utf8'), 'locations');
src = rep(src, [
  ['<h1 className="text-2xl font-bold text-gray-900">Locations</h1>', '<h1 className="text-2xl font-bold text-gray-900">{s.title}</h1>'],
  ['Delivery addresses for purchase orders', '{s.subtitle}'],
  ['<Plus className="w-4 h-4" />New Location', '<Plus className="w-4 h-4" />{s.new}'],
  ['placeholder="Search locations…"', 'placeholder={s.title}'],
  ["'No locations match'", 's.noMatch'],
  ["'No locations yet'", 's.noData'],
  ["'Add your first location →'", 's.createFirst'],
  ["editing.id ? 'Edit Location' : 'New Location'", "editing.id ? t.common.saveChanges : s.new"],
  ['label="Location name *"', 'label={s.locationName + " *"}'],
  ['label="Street address"', 'label={t.common.streetAddress}'],
  ['label="City"', 'label={t.common.city}'],
  ['label="Postal code"', 'label={t.common.postalCode}'],
  ['label="Country"', 'label={t.common.country}'],
  ["editing.status === 'active' ? '✓ Active' : '✗ Inactive'", "editing.status === 'active' ? t.common.statusActive : t.common.statusInactive"],
  ["'Location is visible and can be selected on new POs.'", "s.statusHelp"],
  ["'Location is hidden from all PO dropdowns. Existing POs are not affected.'", "s.statusHelp"],
  ["editing.id ? 'Save changes' : 'Create location'", "editing.id ? t.common.saveChanges : s.new"],
  ["toast.success('Location updated')", 'toast.success(t.common.saved)'],
  ["toast.success('Location created')", 'toast.success(t.common.saved)'],
  ["toast.success('Location deleted')", 'toast.success(t.common.deleted)'],
  ["toast.success('Location deactivated')", 'toast.success(t.common.deactivated)'],
  ["toast.success('Location activated')", 'toast.success(t.common.activated)'],
]);
fs.writeFileSync('src/pages/LocationsPage.tsx', src);
console.log('Locations done');

// Departments
src = addLang(fs.readFileSync('src/pages/DepartmentsPage.tsx', 'utf8'), 'departments');
src = rep(src, [
  ['<h1 className="text-2xl font-bold text-gray-900">Departments</h1>', '<h1 className="text-2xl font-bold text-gray-900">{s.title}</h1>'],
  ['{departments.length} departments', '{departments.length} {s.count}'],
  ['<Plus className="w-4 h-4" />New Department', '<Plus className="w-4 h-4" />{s.new}'],
  ['placeholder="Search departments…"', 'placeholder={s.title}'],
  ["'No departments match'", 's.noMatch'],
  ["'No departments yet'", 's.noData'],
  ["'Add your first department →'", 's.createFirst'],
  ["editing.id ? 'Edit Department' : 'New Department'", "editing.id ? t.common.saveChanges : s.new"],
  ['label="Department name *"', 'label={s.departmentName + " *"}'],
  ["editing.id ? 'Save changes' : 'Create'", "editing.id ? t.common.saveChanges : t.common.create"],
  ["toast.success('Department updated')", 'toast.success(t.common.saved)'],
  ["toast.success('Department created')", 'toast.success(t.common.saved)'],
  ["toast.success('Department deleted')", 'toast.success(t.common.deleted)'],
]);
fs.writeFileSync('src/pages/DepartmentsPage.tsx', src);
console.log('Departments done');

// Items
src = addLang(fs.readFileSync('src/pages/ItemsPage.tsx', 'utf8'), 'items');
src = rep(src, [
  ['<h1 className="text-2xl font-bold text-gray-900">Items / Catalog</h1>', '<h1 className="text-2xl font-bold text-gray-900">{s.title}</h1>'],
  ['<Plus className="w-4 h-4" />New Item', '<Plus className="w-4 h-4" />{s.new}'],
  ['placeholder="Search by name or item number…"', 'placeholder={s.title}'],
  ['<option value="">All categories</option>', '<option value="">{s.allCategories}</option>'],
  ["'No items match your search'", 's.noMatch'],
  ["'No items yet'", 's.noData'],
  ["'Add your first item →'", 's.createFirst'],
  ["editing.id ? 'Edit Item' : 'New Item'", "editing.id ? t.common.saveChanges : s.new"],
  ['label="Name *"', 'label={t.common.name + " *"}'],
  ['label="Long description"', 'label={s.longDescription}'],
  ['label="Default unit"', 'label={s.defaultUnit}'],
  ["editing.status === 'active' ? '✓ Active' : '✗ Inactive'", "editing.status === 'active' ? t.common.statusActive : t.common.statusInactive"],
  ["editing.id ? 'Save changes' : 'Create item'", "editing.id ? t.common.saveChanges : s.new"],
  ["toast.success('Item updated')", 'toast.success(t.common.saved)'],
  ["toast.success('Item created')", 'toast.success(t.common.saved)'],
  ["toast.success('Item deleted')", 'toast.success(t.common.deleted)'],
]);
fs.writeFileSync('src/pages/ItemsPage.tsx', src);
console.log('Items done');

// PurchaseOrdersPage
src = addLang(fs.readFileSync('src/pages/PurchaseOrdersPage.tsx', 'utf8'), 'po');
src = rep(src, [
  ['<h1 className="text-2xl font-bold text-gray-900">Purchase Orders</h1>', '<h1 className="text-2xl font-bold text-gray-900">{s.title}</h1>'],
  ['{filtered.length} shown', '{filtered.length} {t.common.showing}'],
  ['open\'', 'open\''],
  ["pos.filter(p => ['issued','sent'].includes(p.status)).length} open", "pos.filter(p => ['issued','sent'].includes(p.status)).length} {t.common.open}"],
  ['<Plus className="w-4 h-4" />New PO', '<Plus className="w-4 h-4" />{s.new}'],
  ['placeholder="PO number or supplier…"', 'placeholder={s.poNumber + " / " + s.supplier}'],
  ['<option value="">All statuses</option>', '<option value="">{t.filters.allStatuses}</option>'],
  ['<option value="">All time</option>', '<option value="">{t.filters.allTime}</option>'],
  ['<option value="">All suppliers</option>', '<option value="">{t.filters.allSuppliers}</option>'],
  ['<option value="">All categories</option>', '<option value="">{t.filters.allCategories}</option>'],
  ['<option value="">All projects</option>', '<option value="">{t.filters.allProjects}</option>'],
  ['<option value="">All departments</option>', '<option value="">{t.filters.allDepartments}</option>'],
  ["'No purchase orders match your filters'", 's.noMatch'],
  ["'No purchase orders yet'", 's.noData'],
  ["'Create your first PO →'", 's.createFirst'],
  ["['PO Number', 'Supplier', 'Project', 'Category', 'Delivery date', 'Total', 'Status', '']", "[s.poNumber, s.supplier, s.project, s.category, s.deliveryDate, s.total, t.common.status, '']"],
  ["toast.success('Purchase order deleted')", 'toast.success(t.common.deleted)'],
  ["toast.success('Purchase order cancelled')", 'toast.success(t.common.updated)'],
  ["'Clear'", 't.common.clearFilters'],
  ["Last month", "t.filters.lastMonth"],
  ["Last 3 months", "t.filters.last3Months"],
  ["Last 6 months", "t.filters.last6Months"],
  ["Last 12 months", "t.filters.last12Months"],
]);
fs.writeFileSync('src/pages/PurchaseOrdersPage.tsx', src);
console.log('PurchaseOrders done');

console.log('All done!');
