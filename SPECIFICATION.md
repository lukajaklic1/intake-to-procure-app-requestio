# Requestio — Current State Specification

This document describes the **current implementation** of the Requestio application (`C:\intake-to-procure-app`) as of 2026-06-11. It is intended as a reference for planning a redesign/rework. It documents what exists today, including known inconsistencies and gaps.

---

## 1. App Overview

- **Name (current branding):** "Requestio" — appears in `AppLogo.tsx` (`showName` text), landing page, legal pages, and `index.html` title.
- **Domain:** Multi-tenant procurement / purchase-order (PO) management web app for SMEs, with a Slovenian-market PDF document format ("Nabavno naročilo").
- **Tech stack:**
  - React 19 + Vite 8 + TypeScript ~6.0.2
  - Tailwind CSS 3.4.19 (utility classes throughout, default blue palette)
  - Supabase (Postgres + Auth + Storage), `@supabase/supabase-js` 2.106.2
  - `react-router-dom` 7.16.0 — `BrowserRouter` + `Routes`/`Route`
  - `@tanstack/react-query` 5.100.14 — `QueryClientProvider` wraps the app, but most pages use direct `supabase` calls + `useState`/`useEffect` rather than query hooks
  - `date-fns` 4.4.0, `lucide-react` 1.17.0 (icons), `recharts` 3.8.1 (dashboard charts)
  - `@react-pdf/renderer` 4.5.1 (PO PDF generation)
  - `react-hook-form` 7.76.1, `zod` 4.4.3 (declared but not used heavily — most forms use plain `useState`)
  - `clsx` + `tailwind-merge` for class composition
- **Internationalization (i18n):** Custom system via `src/i18n/translations.ts` (single file, `en` and `sl` objects) + `useLanguage` hook/context. Language stored in `localStorage('lang')`, default appears to be browser/locale-driven with fallback. Toggled via EN/SL buttons in sidebar and on public pages.
- **Multi-tenant model:**
  - Central `companies` table; every business table has a `company_id` FK.
  - Users belong to exactly one company via `users.company_id` (1 user → 1 company; `is_admin` boolean flag, but no granular roles).
  - All RLS policies scope rows via `company_id = get_my_company_id()`, where `get_my_company_id()` is a `SECURITY DEFINER` function that looks up `users.company_id` for `auth.uid()`.
  - Onboarding (new company creation + first admin user) is performed via a single `SECURITY DEFINER` RPC (`handle_onboarding`) to avoid RLS chicken-and-egg problems.

---

## 2. Routing & Pages

### 2.1 Route Map (`src/App.tsx`)

The app is wrapped: `QueryClientProvider` → `BrowserRouter` → `AuthProvider` → `LanguageProvider` → `<Toaster/>` (global toast renderer) + `<Routes>`.

**Public routes** (no auth guard):

| Path | Component | Notes |
|---|---|---|
| `/` | `LandingPage` | Marketing/home; redirects to `/dashboard` if already authenticated |
| `/login` | `LoginPage` | Email/password sign-in |
| `/register` | `RegisterPage` | Email/password sign-up |
| `/onboarding` | `OnboardingPage` | Post-signup company/profile setup wizard |
| `/privacy` | `PrivacyPage` | Static legal page (EN/SL) |
| `/terms` | `TermsPage` | Static legal page (EN/SL) |
| `/forgot-password` | `ForgotPasswordPage` | Sends Supabase password reset email |
| `/reset-password` | `ResetPasswordPage` | Handles `PASSWORD_RECOVERY` auth event, sets new password |

**Protected routes** (each rendered as `<App><Page/></App>`, where `App`/`AppLayout` provides the authenticated shell — sidebar + guard):

| Path | Component | Purpose |
|---|---|---|
| `/dashboard` | `DashboardPage` | KPI/analytics dashboard |
| `/purchase-orders` | `PurchaseOrdersPage` | PO list with filters |
| `/purchase-orders/new` | `POFormPage` | Create new PO |
| `/purchase-orders/:id` | `PODetailPage` | Read-only PO detail/view |
| `/purchase-orders/:id/edit` | `POFormPage` | Edit existing PO (same component as create, mode driven by `:id`) |
| `/suppliers` | `SuppliersPage` | Supplier CRUD |
| `/items` | `ItemsPage` | Item catalog CRUD |
| `/categories` | `CategoriesPage` | Category CRUD |
| `/projects` | `ProjectsPage` | Project CRUD |
| `/locations` | `LocationsPage` | Delivery location CRUD |
| `/departments` | `DepartmentsPage` | Department CRUD |
| `/settings` | `SettingsPage` | Personal/company/PO/bank settings |

**Catch-all:** `*` → redirect to `/`.

---

### 2.2 Page-by-Page Detail

#### LandingPage (`src/pages/LandingPage.tsx`)
- Public marketing page. Redirects authenticated users to `/dashboard`.
- Sticky nav: anchor links (Features, How it works, Pricing), sign-in link, EN/SL language switcher, "Register" CTA button, `AppLogo`.
- Hero section with headline/subheading and a "fake browser window" mockup showing a stylized dashboard preview (static, hardcoded).
- Trust bar (logos/text, generic).
- Features grid: 4 feature cards driven by a `FEATURE_ICONS` map (icons from lucide-react), each with title + description.
- "How it works" section: 3 numbered steps with icons/descriptions.
- Pricing section: 4 plan cards —
  - **Free** — €0
  - **Starter** — €19/mo (€15/mo billed yearly)
  - **Professional** — €39/mo (€29/mo yearly), marked "Most popular"
  - **Team** — €69/mo (€55/mo yearly)
  - Each plan has a feature checklist; some items marked "(soon)" indicating unreleased features.
- CTA banner ("Get started" style), footer with Privacy/Terms/Contact links and `AppLogo`.

#### LoginPage (`src/pages/LoginPage.tsx`)
- Email + password form → `supabase.auth.signInWithPassword({ email, password })`.
- Links: "Forgot password?" → `/forgot-password`; "Don't have an account? Register" → `/register`.
- EN/SL language switcher in header.
- On success → navigate to `/dashboard` (AppLayout/AuthProvider then determines onboarding status).

#### RegisterPage (`src/pages/RegisterPage.tsx`)
- Fields: email, password, confirm password.
- Validation: passwords must match; password min length 8; must check "I agree to Terms and Privacy" checkbox (links to `/terms`, `/privacy`).
- Calls `supabase.auth.signUp({ email, password })`.
- On success → navigate to `/onboarding`.

#### ForgotPasswordPage (`src/pages/ForgotPasswordPage.tsx`)
- Single email field.
- Calls `supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/reset-password` })`.
- Shows a confirmation/success state after sending (no error detail revealed about whether email exists, for security).

#### ResetPasswordPage (`src/pages/ResetPasswordPage.tsx`)
- Listens for the `PASSWORD_RECOVERY` event via `supabase.auth.onAuthStateChange`.
- Shows a loading state; if no recovery session arrives within ~3 seconds, shows an error/expired-link message.
- Once recovery session detected: form with new password + confirm password (validates match, min 8 chars).
- Calls `supabase.auth.updateUser({ password })`, then `supabase.auth.signOut()`, then navigates to `/login`.
- Related: `useAuth` exposes `isPasswordRecovery` flag (set on `PASSWORD_RECOVERY` event) so `AppLayout` can redirect to `/reset-password` instead of `/` if a recovery flow is in progress while a session exists.

#### OnboardingPage (`src/pages/OnboardingPage.tsx`)
- 2-step wizard with a progress indicator.
  - **Step 1 — Company:** company name input (required).
  - **Step 2 — Profile:** first name + last name inputs (required).
- On final submit, calls RPC `handle_onboarding(p_company_name, p_first_name, p_last_name)`.
- On success, navigates to `/dashboard`.

#### PrivacyPage / TermsPage (`src/pages/PrivacyPage.tsx`, `src/pages/TermsPage.tsx`)
- Static, fully bilingual (inline `isSl` ternaries, NOT using the `translations.ts` system).
- Both have sticky nav with `AppLogo` + EN/SL switcher, "Last updated: June 2026" date.
- **Terms** — 11 sections: Acceptance, Service Description, Account/User Responsibility, Payments & Subscriptions (free plan up to 15 orders/month, no refunds), Data Ownership, Limitation of Liability (caps liability at 3 months' fees), Service Availability, Termination of Access (30-day data export), Changes to Terms, Governing Law (Slovenia/Ljubljana courts), Contact (`info@tce.si`).
- **Privacy** — 11 sections: Data Controller (TCE, d.o.o.), What Data We Collect, Purpose/Legal Basis (GDPR Art. 6(1)(b)), Data Retention (business docs retained 1 year post-closure, attachments deleted immediately, security logs 90 days), Storage & Security (Supabase EU/Frankfurt, SOC 2 Type II, TLS 1.2+, AES-256), Third-Party Sharing (Supabase Inc., Vercel Inc.), Your Rights (GDPR rights list), Cookies (only essential, no consent banner needed), Complaints (Slovenian Information Commissioner), Changes to Policy, Contact.
- Both reference the legal entity **"TCE, d.o.o."** as service provider/data controller.

---

#### DashboardPage (`src/pages/DashboardPage.tsx`)
- **Filters** (drive a single backend call): date range (`1m`/`3m`/`6m`/`1y`/`all`), supplier, category, project, department.
- **Data loading:** single RPC call `get_dashboard_stats(p_company_id, p_date_from, p_supplier_id, p_category_id, p_project_id, p_department_id, p_months)` returns one JSON blob with all dashboard data.
- **Setup checklist banner:** dismissible banner shown only if not all 8 onboarding milestones are complete:
  1. Company created
  2. Company address added
  3. First supplier created
  4. First category created
  5. First project created
  6. First location created
  7. First department created
  8. First PO created
- **Stat cards (4):** Total spend, PO count, Open POs (count), Average PO value — all currency-formatted using company currency.
- **Charts (5, recharts `BarChart`):**
  1. Spend over time (monthly, last `p_months` months — default 12)
  2. Spend by category (top 8)
  3. Spend by supplier (top 10)
  4. Spend by project (top 10)
  5. Spend by department (top 10)
  6. Spend by material/line item (top 10) — *(6 charts total, despite "5" stated in summary; see RPC section for exact key names)*
- **Recent POs table:** last 8 POs (unfiltered by the page filters — RPC always returns the latest 8 regardless of filter state), with status badges (color map shared with PO list/detail pages).
- Spend/PO-count summary in `summary` only counts POs with status `issued`, `sent`, or `closed` (drafts/cancelled excluded). `open_pos` counts `issued`+`sent` POs, **unfiltered** by the page's filter selections.

#### PurchaseOrdersPage (`src/pages/PurchaseOrdersPage.tsx`)
- **Data loading:** single fetch of ALL company POs (`select id, po_number, status, total_amount, created_at, expected_delivery_date, supplier_id, category_id, project_id, department_id` + joined `suppliers(name)`, `categories(name)`, `projects(name)`, `locations(name)`), ordered by `created_at desc`. All filtering/pagination is **client-side**.
- **Filters:** free-text search (matches `po_number` or supplier name, case-insensitive), status (`all`/`draft`/`issued`/`sent`/`closed`/`cancelled`), date range (`all`/`1m`/`3m`/`6m`/`1y`, computed via `date-fns` `subMonths`/`startOfMonth`), supplier, category, project, department (each populated from separate reference-data queries scoped to active suppliers + all categories/projects/departments).
- "Clear filters" link appears when any filter is active.
- **Pagination:** `PAGE_SIZE = 20`, client-side slicing via shared `Pagination` component.
- **Header subtitle:** Slovenian uses pluralization helpers `stNarocil(count)` and `stOdprtihNarocil(openCount)`; English uses simple `"{n} {t.po.shown}"` / `"{n} {t.common.open}"`.
- **Status badge colors:** `draft`=gray, `issued`=amber, `sent`=blue, `closed`=green, `cancelled`=red (`STATUS_BADGE` map — repeated in PODetailPage and DashboardPage).
- **Table columns:** PO number (link to detail) + created date, supplier, project, category (small text), expected delivery date, total (currency-formatted), status badge, actions.
- **Row actions:**
  - `status === 'draft'` → Edit (pencil icon, links to `/purchase-orders/:id/edit`) + Delete (trash icon, opens `ConfirmDialog`; deletes the PO row, cascading to `po_line_items` via `ON DELETE CASCADE`).
  - Any other status → Eye icon linking to `/purchase-orders/:id` (view-only).
- **Confirm dialogs:**
  - Delete PO — danger-styled, message warns line items will also be deleted, irreversible.
  - Cancel PO (`confirmCancel` state + `handleCancel` — sets `status = 'cancelled'`) — this dialog and its trigger state exist in code, but no visible UI button sets `confirmCancel` from this page; cancellation is actually triggered from `PODetailPage`. Likely leftover/dead code path.
- All dialog titles/messages on this page are hardcoded in **Slovenian** regardless of `lang` (e.g., "Izbriši naročilo", "Prekliči naročilo") — inconsistent with the rest of the i18n'd UI.

#### POFormPage (`src/pages/POFormPage.tsx`) — largest page (~805 lines), used for both create (`/purchase-orders/new`) and edit (`/purchase-orders/:id/edit`)
- **Header fields:**
  - Supplier — custom `SupplierSearch` autocomplete/combobox (required)
  - Category — `SearchCombobox` (required)
  - Project — `SearchCombobox`, displays `project_code` alongside name (required)
  - Location — plain `<select>` (required)
  - Department — plain `<select>` (optional)
  - Payment terms — text input (required)
  - Expected delivery date — date input (required)
  - Incoterm — text input (optional)
  - Supplier quote reference — text input (optional)
  - Notes — textarea (optional)
- **Line items table:**
  - Position — auto-incremented in steps of 10 (10, 20, 30, …) when adding rows
  - Item — `ItemSearch` autocomplete against the `items` catalog; selecting an item auto-fills `item_number`, `name`, `long_description`, `default_unit` → `unit`, `default_unit_price` → `unit_price`
  - Item number — read-only, derived from selected catalog item
  - Name, long description — editable text fields
  - Quantity — custom numeric input that accepts both comma and dot as decimal separator
  - Unit — text field
  - Unit price — numeric
  - Line total — computed (`quantity * unit_price`), read-only display
  - Rows can be added/removed
- **Footer / totals:**
  - Subtotal (sum of line totals) — shown only if a discount is applied
  - Discount amount — numeric input (currency value, accepts comma/dot)
  - Grand total = `max(0, subtotal - discount)`
- **Attachments:**
  - Upload to Supabase Storage bucket `quotations`, path pattern `${company.id}/${poId}/${timestamp}-${sanitized filename}`
  - On upload, inserts a row into `po_attachments` (file_path, file_name, file_size, po_id, company_id)
  - Existing attachments listed; can be opened via a 1-hour signed URL or deleted (removes storage object + DB row)
- **Status-driven read-only logic:**
  - `isReadOnly = status in ('closed', 'cancelled')` — form fields disabled
  - `isSent = status === 'sent'`
  - New PO / draft → primary actions: **"Save Draft"** (status remains `draft`) and **"Issue PO"** (sets `status = 'issued'`)
  - If `isSent` → single **"Save Changes"** action that preserves `status = 'sent'`
  - Otherwise (issued, etc.) → **"Save Changes"** preserves the current status
- **PO numbering (new POs):** calls RPC `generate_po_number(p_company_id)` to obtain the next `po_number`. **This RPC is referenced in the frontend but does not exist in any of the 8 migration files** — see Section 9 (Known Inconsistencies).
- **Validation (client-side):** `supplier_id`, `category_id`, `project_id`, `location_id`, `payment_terms`, `expected_delivery_date` required; at least one line item; every line item must have a non-empty `name`.

#### PODetailPage (`src/pages/PODetailPage.tsx`)
- Read-only view of a single PO.
- Status badge (same `STATUS_BADGE` color map as the list page).
- **Three info cards:**
  1. Supplier — name, VAT number, email, address
  2. Delivery — location name + expected delivery date
  3. Order details — project (name + code), category, department, payment terms, incoterm, supplier quote reference
- **Line items table:** item number, position, name/description, quantity, unit, unit price, line total; footer row(s) show subtotal/discount/grand total conditionally (only if `discount_amount > 0`).
- **Notes section** — shown if `notes` is non-empty.
- **Attachments list** — each entry clickable, opens via 1-hour signed URL.
- **Action buttons (status-dependent):**
  - "Download PDF" — always available, via `usePODownload` hook
  - "Edit" — shown if status is `draft`, `issued`, or `sent`
  - "Mark as Sent" — shown if status is `issued`; via `ConfirmDialog`, sets `status = 'sent'`
  - "Mark as Closed" — shown if status is `sent`; via `ConfirmDialog` (with CheckCircle icon), sets `status = 'closed'`
  - "Cancel PO" — shown if status is `issued` or `sent`; via danger-styled `ConfirmDialog`, sets `status = 'cancelled'`
- **Confirmed PO status lifecycle (from UI logic):**
  ```
  draft → issued → sent → closed
            └─────────┴──→ cancelled (from issued or sent)
  ```
  `draft` and `cancelled`/`closed` are terminal with respect to further status transitions in the UI (closed/cancelled are read-only).

#### SuppliersPage (`src/pages/SuppliersPage.tsx`)
- CRUD for `suppliers` table.
- **Search:** matches name or email.
- **Filter:** status (`all`/`active`/`inactive`).
- **Pagination:** `PAGE_SIZE = 20`.
- **Form (modal):** name* (required), vat_number* (required), contact_name, address_street* (required), address_city* (required), address_postal_code, address_country, email, phone, payment_terms.
- **Status toggle** (active/inactive switch) — shown only when editing an existing supplier (new suppliers default to active).
- **Delete protection:** before deleting, checks if the supplier has any `purchase_orders`; if count > 0, deletion is blocked with an error toast.

#### ItemsPage (`src/pages/ItemsPage.tsx`)
- CRUD for `items` (catalog).
- **Search:** matches name or item_number.
- **Filters:** category, status (`all`/`active`/`inactive`).
- **Pagination:** `PAGE_SIZE = 20`.
- **Item numbering:** new items get `nextItemNumber()` = (max existing `item_number`, parsed as integer) + 1; if no items exist yet, starts at `"100001"`.
- **Form (modal):** item_number (read-only when editing, auto-assigned on create), name* (required), long_description (textarea), category_id (select), default_unit, default_unit_price (custom numeric input accepting comma or dot as decimal separator).
- **Status toggle** — shown only when editing.
- **Delete protection:** blocked if the item is referenced by any `po_line_items`.

#### CategoriesPage (`src/pages/CategoriesPage.tsx`)
- Simple CRUD: single `name` field.
- Search (by name), pagination (`PAGE_SIZE = 20`).
- **Delete protection:** blocked if the category is referenced by any `purchase_orders` OR any `items` (both counts checked).

#### ProjectsPage (`src/pages/ProjectsPage.tsx`)
- CRUD for `projects`.
- **Form fields:** name* (required), project_code, customer, start_date, end_date, status (active/inactive — toggle shown when editing).
- **Search:** matches name, project_code, or customer.
- **Filter:** status. **Pagination:** `PAGE_SIZE = 20`.
- **Delete protection:** blocked if the project is referenced by any `purchase_orders`.

#### LocationsPage (`src/pages/LocationsPage.tsx`)
- CRUD for `locations`.
- **Form fields:** name* (required), address_street* (required), address_city* (required), address_postal_code, address_country, status toggle (when editing).
- **Search:** matches name or city. **Filter:** status. **Pagination:** `PAGE_SIZE = 20`.
- **Delete protection:** blocked if the location is referenced by any `purchase_orders`.

#### DepartmentsPage (`src/pages/DepartmentsPage.tsx`)
- Simple CRUD: single `name` field (no status field — matches schema, `departments` table has no status column).
- Search (by name), pagination (`PAGE_SIZE = 20`).
- **Delete protection:** blocked if the department is referenced by any `purchase_orders`.

#### SettingsPage (`src/pages/SettingsPage.tsx`)
- Four sections, each rendered via a reusable `Section` component (icon + title + content card), each with its own independent Save button/loading state:
  1. **Personal Profile** — `first_name`, `last_name` (saved to `users` table by current user id)
  2. **Company Profile** — `name`, `email`, `phone`, `tax_id`, address fields (saved to `companies` table)
  3. **PO Settings** — `currency` (dropdown of 10 currencies: EUR, USD, GBP, CHF, SEK, NOK, DKK, PLN, CZK, HRK), `po_prefix`, `po_next_number` (numeric); live preview text "Next PO will be: `{prefix}-{next_number padded to 4 digits}`"
  4. **Bank Details** — `bank_name`, `bank_iban`

---

## 3. Database Schema

Schema is built incrementally across 8 migration files, applied in this order:

1. `001_initial_schema.sql`
2. `002_fix_onboarding_rls.sql`
3. `003_fix_rls_recursion.sql`
4. `004_fix_companies_insert.sql`
5. `005_onboarding_rpc.sql`
6. `20260531100000_dashboard_rpc.sql`
7. `20260531120000_quotation_upload.sql`
8. `20260601_po_attachments.sql`

### 3.1 Tables (from `001_initial_schema.sql`, as later modified)

#### `companies`
```sql
CREATE TABLE companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  phone text,
  tax_id text,
  address_street text,
  address_city text,
  address_postal_code text,
  address_country text,
  bank_name text,
  bank_iban text,
  currency text NOT NULL DEFAULT 'EUR',
  po_prefix text NOT NULL DEFAULT 'PO',
  po_next_number integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```
- RLS enabled. Final policies (from `004_fix_companies_insert.sql`):
  - `companies_select` — `id = get_my_company_id()`
  - `companies_insert` — allowed for any authenticated user (needed for onboarding bootstrap)
  - `companies_update` — `id = get_my_company_id()`
  - `companies_delete` — `id = get_my_company_id()`

#### `users`
```sql
CREATE TABLE users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  first_name text,
  last_name text,
  is_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```
- RLS enabled. Final policies (from `004_fix_companies_insert.sql`):
  - `users_select` — `id = auth.uid() OR company_id = get_my_company_id()`
  - `users_insert` — `id = auth.uid()` (self-row creation during onboarding)
  - `users_update` — `id = auth.uid()`
  - `users_delete` — `id = auth.uid()`

#### `suppliers`
```sql
CREATE TABLE suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  vat_number text,
  contact_name text,
  email text,
  phone text,
  address_street text,
  address_city text,
  address_postal_code text,
  address_country text,
  payment_terms text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```
- RLS: `FOR ALL USING (company_id = get_my_company_id())` (single combined policy retained from `001`, scoping function updated in `003`/`004`).

#### `categories`
```sql
CREATE TABLE categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```
- RLS: `FOR ALL USING (company_id = get_my_company_id())`.

#### `projects`
```sql
CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  project_code text,
  customer text,
  start_date date,
  end_date date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```
- RLS: `FOR ALL USING (company_id = get_my_company_id())`.

#### `locations`
```sql
CREATE TABLE locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  address_street text,
  address_city text,
  address_postal_code text,
  address_country text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```
- RLS: `FOR ALL USING (company_id = get_my_company_id())`.

#### `departments`
```sql
CREATE TABLE departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```
- No `status` column. RLS: `FOR ALL USING (company_id = get_my_company_id())`.

#### `items`
```sql
CREATE TABLE items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  item_number text NOT NULL,
  name text NOT NULL,
  long_description text,
  default_unit text,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```
- **NOTE:** `default_unit_price` is NOT defined in this (or any) migration, but the frontend (`ItemsPage.tsx`, `POFormPage.tsx`, `types/database.ts`) reads/writes `items.default_unit_price` as `number | null`. See Section 9.
- RLS: `FOR ALL USING (company_id = get_my_company_id())`.

#### `purchase_orders`
```sql
CREATE TABLE purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  po_number text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','issued','sent','closed','cancelled')),
  supplier_id uuid REFERENCES suppliers(id) ON DELETE RESTRICT,
  category_id uuid REFERENCES categories(id) ON DELETE RESTRICT,
  project_id uuid REFERENCES projects(id) ON DELETE RESTRICT,
  location_id uuid REFERENCES locations(id) ON DELETE RESTRICT,
  department_id uuid REFERENCES departments(id) ON DELETE RESTRICT,
  payment_terms text,
  incoterm text,
  supplier_quote_ref text,
  notes text,
  expected_delivery_date date,
  total_amount numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```
- **`status` CHECK constraint values:** `'draft' | 'issued' | 'sent' | 'closed' | 'cancelled'` — this is the authoritative set actually used by all UI code.
- **`quotation_url text`** column added later by `20260531120000_quotation_upload.sql` (now effectively superseded by the `po_attachments` table — likely unused/dead column).
- **NOTE:** `discount_amount` is NOT defined in this (or any) migration, but is read/written pervasively by `POFormPage.tsx`, `PODetailPage.tsx`, `PODocument.tsx`, and `usePODownload.ts`. See Section 9.
- Indexes added by `20260531100000_dashboard_rpc.sql`: `idx_po_company_status (company_id, status)`, `idx_po_company_created (company_id, created_at)`.
- RLS: `FOR ALL USING (company_id = get_my_company_id())`.

#### `po_line_items`
```sql
CREATE TABLE po_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  position integer NOT NULL,
  item_id uuid REFERENCES items(id) ON DELETE SET NULL,
  item_number text,
  name text NOT NULL,
  long_description text,
  quantity numeric(14,3) NOT NULL DEFAULT 0,
  unit text,
  unit_price numeric(14,2) NOT NULL DEFAULT 0,
  line_total numeric(14,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```
- `line_total` is a generated/computed column (`quantity * unit_price`).
- Index added by `20260531100000_dashboard_rpc.sql`: `idx_po_line_items_po_id (po_id)`.
- RLS: scoped via the parent PO's `company_id` (subquery to `purchase_orders`).

#### `po_attachments` (added by `20260601_po_attachments.sql`)
```sql
CREATE TABLE po_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  file_name text NOT NULL,
  file_size bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_po_attachments_po_id ON po_attachments(po_id);

ALTER TABLE po_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can manage attachments" ON po_attachments
  FOR ALL
  USING (company_id = get_my_company_id())
  WITH CHECK (company_id = get_my_company_id());
```
- **NOTE:** `types/database.ts`'s `PoAttachment` interface includes `uploaded_by`, `file_url`, `file_size_kb` — none of which exist on this table (actual columns are `file_path`, `file_name`, `file_size`; no `uploaded_by`). See Section 9.

### 3.2 RLS Policy Evolution Summary

- **`001_initial_schema.sql`** — all tables get `FOR ALL` policies scoped via a subquery: `company_id IN (SELECT company_id FROM users WHERE id = auth.uid())`.
- **`002_fix_onboarding_rls.sql`** — replaces the combined `FOR ALL` policies on `companies`/`users` with per-operation (`SELECT`/`INSERT`/`UPDATE`/`DELETE`) policies, attempting to fix the chicken-and-egg problem where a brand-new user can't insert their company/user row because the subquery requires an existing `users` row.
- **`003_fix_rls_recursion.sql`** — the per-operation policies on `users` still caused **infinite recursion** (policy on `users` querying `users`). Fix: introduces `get_my_company_id() RETURNS uuid` as a `SECURITY DEFINER` function (bypasses RLS internally), and rewrites `companies_*` and `users_*` policies to use it.
- **`004_fix_companies_insert.sql`** — a "nuclear reset": dynamically drops *all* existing policies on `companies` and `users` via a `DO` block (to clean up any leftover/duplicate policies from prior migrations), recreates `get_my_company_id()` with `SET search_path = public` (security hardening), and recreates the same final policy set as `003`.
- All other tables (`suppliers`, `categories`, `projects`, `locations`, `departments`, `items`, `purchase_orders`, `po_line_items`, `po_attachments`) use simple `FOR ALL USING (company_id = get_my_company_id())` policies (no recursion issue since they don't reference `users`).

### 3.3 RPC Functions

#### `get_my_company_id()`
- `RETURNS uuid`, `SECURITY DEFINER`, `SET search_path = public`.
- Looks up and returns `company_id` from the `users` table for `auth.uid()`. Used throughout RLS policies to avoid recursive self-references.

#### `handle_onboarding(p_company_name text, p_first_name text, p_last_name text)`
- Defined in `005_onboarding_rpc.sql`. `RETURNS json`, `SECURITY DEFINER`, granted to `authenticated`.
- Creates a new row in `companies` with `currency = 'EUR'`, `po_prefix = 'PO'`, `po_next_number = 1`, and the given name.
- Inserts a row into `users` for `auth.uid()` with `is_admin = true`, `first_name`, `last_name`, and the new `company_id`.
- Returns `{ "company_id": ..., "user_id": ... }`.

#### `get_dashboard_stats(...)`
- Defined in `20260531100000_dashboard_rpc.sql`. `RETURNS json`.
- Signature: `(p_company_id uuid, p_date_from timestamptz DEFAULT NULL, p_supplier_id uuid DEFAULT NULL, p_category_id uuid DEFAULT NULL, p_project_id uuid DEFAULT NULL, p_department_id uuid DEFAULT NULL, p_months int DEFAULT 12)`.
- Returns a single JSON object with keys:
  - `summary` — `{ total_spend, po_count, avg_po }` — only counts POs with `status IN ('issued','sent','closed')`, filtered by all supplied params and `p_date_from`.
  - `open_pos` — count of POs with `status IN ('issued','sent')`, **unfiltered** by supplier/category/project/department/date (company-scoped only).
  - `spend_by_month` — last `p_months` months via `generate_series`, filtered.
  - `spend_by_supplier` — top 10, filtered.
  - `spend_by_category` — top 8, filtered.
  - `spend_by_project` — top 10, filtered.
  - `spend_by_department` — top 10, filtered.
  - `spend_by_material` — top 10, derived from `po_line_items` (joined to `items`/line names), filtered.
  - `recent_pos` — last 8 POs by `created_at desc`, **unfiltered**.

#### `generate_po_number(p_company_id uuid)` — **MISSING / NOT FOUND**
- Called from `POFormPage.tsx` when creating a new PO, presumably to atomically read+increment `companies.po_next_number` and format `${po_prefix}-${padded number}`.
- **Not present in any of the 8 migration files.** This is a hard gap — either the function exists only in the live Supabase project (not checked into migrations) or PO creation is currently broken in fresh environments. Flagged for the redesign.

### 3.4 Storage

#### Bucket: `quotations`
- Created in `20260531120000_quotation_upload.sql`.
- **Private** bucket, **10MB** file size limit.
- Allowed MIME types: `application/pdf`, `image/jpeg`, `image/png`, `image/webp`.
- RLS policies on `storage.objects` for this bucket (insert/select/delete), all scoped via:
  ```sql
  (storage.foldername(name))[1] = get_my_company_id()::text
  ```
  i.e., the first path segment of the object key must equal the caller's company ID. Actual upload path used by the frontend is `${company.id}/${poId}/${timestamp}-${sanitized filename}`.

---

## 4. Shared Components

### UI primitives (`src/components/ui/`)

- **`Button.tsx`** — variants: `primary` (blue-600 bg/white text), `secondary` (white bg, gray border), `ghost` (transparent), `danger` (red-600). Sizes: `sm`/`md`/`lg`. Supports `loading` prop (renders inline spinner SVG, disables button).
- **`Input.tsx`** — `forwardRef` wrapped `<input>`, optional `label` prop and `error` message; on error, border and background turn red-tinted.
- **`Modal.tsx`** — centered modal with backdrop blur; closes on `Escape` key or backdrop click; sizes `sm`/`md`/`lg` map to `max-w-sm`/`max-w-lg`/`max-w-2xl`.
- **`ConfirmDialog.tsx`** — wraps `Modal` (size `sm`); renders title, message, Cancel + Confirm buttons; `danger` prop switches Confirm to red/danger styling; supports `loading` state (disables buttons, shows spinner on Confirm). **Inconsistency:** the Cancel button's label is computed via `localStorage.getItem('lang') === 'sl' ? 'Prekliči' : 'Cancel'` directly, rather than via the `useLanguage` hook/`translations.ts` — bypasses the app's i18n context.
- **`Pagination.tsx`** — shows "Showing X–Y of Z" (this English string is **hardcoded**, not run through i18n), numbered page buttons with ellipsis collapsing for large page counts, prev/next chevron buttons. Component renders nothing (`null`) if `totalPages <= 1`.
- **`Toast.tsx`** — global toast notification system implemented via a module-level array of listener callbacks (no context/provider needed beyond mounting `<Toaster/>` once). Exposes `toast.success(message)` and `toast.error(message)`. Toasts auto-dismiss after 3500ms, render fixed bottom-right. Success style = dark gray background + green checkmark icon; error style = red background + X icon.
- **`AppLogo.tsx`** — SVG logo: 40×40 rounded square (`rx=10`), fill `#2563eb` (Tailwind `blue-600`), containing 3 white "isometric box" face paths at opacities 1 / 0.45 / 0.7 (Airtable-style abstract cube icon). Sizes: `sm` = 30px, `md` = 38px (default), `lg` = 52px. Props: `showName` (boolean, default true — renders "Requestio" text next to icon), `dark` (boolean — switches text color from `text-gray-900` to `text-white` for dark backgrounds).

### Layout (`src/components/layout/`)

- **`AppLayout.tsx`** — top-level authenticated shell. On mount, checks `useAuth()` session: if no session, redirects to `/` (or to `/reset-password` if `isPasswordRecovery` is true). Renders a responsive layout: `Sidebar` as a slide-in drawer on mobile (`translate-x-full`/`translate-x-0` toggle) and a static column on desktop (`lg:` breakpoint), plus a main content `<Outlet/>`/children area. Mobile view has a top bar with a hamburger menu button and `AppLogo`.
- **`Sidebar.tsx`** — navigation order (`NAV_KEYS`), each with a lucide icon:
  1. Dashboard — `LayoutDashboard`
  2. Purchase Orders — `FileText`
  3. Suppliers — `Building2`
  4. Items — `Package`
  5. Categories — `Tag`
  6. Projects — `FolderOpen`
  7. Locations — `MapPin`
  8. Departments — `Users`
  - Top of sidebar shows a company-name badge.
  - Bottom section: Settings link, EN/SL language toggle buttons, user avatar (initials derived from `first_name`/`last_name`) + display name + sign-out button.

### Auth Guard

- **`AuthGuard.tsx`** (`src/components/AuthGuard.tsx`) — a standalone guard component: redirects to `/login` if no session, shows a loading spinner while `useAuth().loading` is true. **Appears to be unused/dead code** — `App.tsx`'s routing relies on `AppLayout`'s own inline session check rather than wrapping routes in `AuthGuard`.

### PDF Generation

- **`PODocument.tsx`** (`src/components/PODocument.tsx`) — `@react-pdf/renderer` document component.
  - Registers custom font "Roboto" from `/fonts/Roboto-Regular.ttf` and `/fonts/Roboto-Bold.ttf`.
  - `PODocData` interface: `po_number`, `status`, `created_at`, `expected_delivery_date`, `payment_terms`, `incoterm`, `supplier_quote_ref`, `notes`, `discount_amount`, `total_amount`, `currency`, `company` (name/address/contact/bank details), `supplier`, `location`, `project`, `category`, `department`, `lines[]`.
  - **Layout:**
    - Top row: document title **"Nabavno naročilo"** (Slovenian for "Purchase Order"), PO number, dates.
    - Company info box (name, address, contact details).
    - Supplier address box and delivery address box, side by side.
    - Terms row: payment terms / incoterm / supplier quote reference.
    - Line items table with Slovenian column headers: **Pos / Šifra / Opis / Kol / EM / Cena per EM / Znesek** (Position / Code / Description / Qty / Unit / Unit Price / Amount).
    - Optional subtotal + discount rows (rendered only if `discount_amount > 0`).
    - Total row labeled **"Skupaj brez DDV"** (Total excl. VAT).
    - Notes section (if present).
    - Footer: company info + bank details + page numbers.
  - **All labels are hardcoded in Slovenian**, regardless of the user's selected UI language (`lang`).

---

## 5. Hooks (`src/hooks/`)

- **`useAuth.ts`** — `AuthProvider` + `useAuth()` context. State: `session` (Supabase session object), `loading` (boolean, true until initial session check completes), `isPasswordRecovery` (boolean, set to `true` when a `PASSWORD_RECOVERY` auth event fires via `onAuthStateChange`). Method: `signOut()`. Initializes via `supabase.auth.getSession()` then subscribes to `onAuthStateChange`.
- **`useCompany.ts`** — `useCompany()` hook. Loads the current user's row from `users` (by `session.user.id`), then loads the corresponding `companies` row by `company_id`. Returns `{ company, profile, loading, refetch }`.
- **`useLanguage.tsx`** — `LanguageProvider` + `useLanguage()` context. State: `lang` (`'en' | 'sl'`, persisted to `localStorage('lang')`), `setLang(lang)`, and `t` = `translations[lang]` (the active translation object).
- **`usePODownload.ts`** — `downloadPO(poId, companyId)`. Fetches the PO, company, line items, and joined `items(item_number)` from Supabase, assembles a `PODocData` object (mapping `discount_amount: po.discount_amount ?? 0`), renders it via `pdf(<PODocument data={data}/>).toBlob()`, and triggers a browser download named `${po_number}_${supplierSlug}_${dateStr}.pdf`.

---

## 6. i18n Structure (`src/i18n/translations.ts`)

A single file exports an object with two top-level locale keys, `en` and `sl`, each containing the same set of namespaces (line numbers below refer to the `en` block; the `sl` block mirrors the same structure starting around line 401):

| Namespace | Approx. purpose |
|---|---|
| `nav` | Sidebar navigation labels (Dashboard, Purchase Orders, Suppliers, Items, Categories, Projects, Locations, Departments, Settings) |
| `common` | Shared/generic strings — buttons (Save, Cancel, Delete, Edit, etc.), statuses (active/inactive), "deleted"/"updated" toast messages, "clear filters", "open", pagination-adjacent text |
| `status` | PO status display labels: `draft`, `issued`, `sent`, `closed`, `cancelled` |
| `dashboard` | Dashboard page strings — stat card labels, chart titles, filter labels |
| `checklist` | Setup checklist banner items (8 onboarding milestones) and related copy |
| `filters` | Generic filter dropdown option labels (All Statuses, All Time, Last Month, Last 3/6/12 Months, All Suppliers/Categories/Projects/Departments, etc.) |
| `po` | Purchase order list/detail/form strings — titles, field labels (PO number, supplier, project, category, delivery date, total, etc.), empty states, "shown"/"createFirst" |
| `suppliers` | Supplier page field labels and messages |
| `items` | Item catalog page field labels and messages |
| `categories` | Category page strings |
| `projects` | Project page field labels and messages |
| `locations` | Location page field labels and messages |
| `departments` | Department page strings |
| `settings` | Settings page section titles and field labels (Personal Profile, Company Profile, PO Settings, Bank Details, currency list, etc.) |
| `auth` | Login/Register/Forgot/Reset password page strings |
| `onboarding` | Onboarding wizard step labels and field prompts |
| `language` | Language switcher labels |
| `landing` | Landing page marketing copy (hero, features, pricing plans, CTAs, footer) |

Notes:
- Both `en` and `sl` objects mirror this exact namespace list (verified structurally — both define `nav`, `common`, `status`, `dashboard`, `checklist`, `filters`, `po`, `suppliers`, `items`, `categories`, `projects`, `locations`, `departments`, `settings`, `auth`, `onboarding`, `language`, `landing`).
- `PrivacyPage.tsx` and `TermsPage.tsx` do **not** use this translation system — they implement bilingual content via inline `isSl ? '...' : '...'` ternaries throughout the component body.
- Slovenian pluralization for counts (suppliers, items, categories, projects, locations, departments, POs, open POs) is handled separately via `src/utils/pluralize.ts`, which exports `slPlural(n, ednina, dvojina, mnozina, rodilnik)` (singular / dual / few(3-4) / genitive-plural — standard Slovenian noun declension rules) and pre-built helpers: `stDobaviteljev`, `stArtiklov`, `stProjektov`, `stKategorij`, `stOddelkov`, `stLokacij`, `stNarocil`, `stOdprtihNarocil`. These are used directly in `PurchaseOrdersPage.tsx` (and presumably other list pages) only for the `lang === 'sl'` branch, with English using simple template strings.

---

## 7. Business Rules / Domain Logic

### 7.1 PO Lifecycle
- Status values (authoritative, per SQL CHECK + UI usage): `draft`, `issued`, `sent`, `closed`, `cancelled`.
- Transitions:
  - New PO → `draft` (default)
  - `draft` → `issued` (via "Issue PO" button on `POFormPage`)
  - `issued` → `sent` (via "Mark as Sent" on `PODetailPage`)
  - `sent` → `closed` (via "Mark as Closed" on `PODetailPage`)
  - `issued` or `sent` → `cancelled` (via "Cancel PO" on `PODetailPage`)
  - `draft` POs can be permanently **deleted** (cascades to `po_line_items`); non-draft POs cannot be deleted, only cancelled.
  - `closed` and `cancelled` are terminal — forms become fully read-only.
- Status badge color coding (consistent across `PurchaseOrdersPage`, `PODetailPage`, `DashboardPage`): `draft`=gray, `issued`=amber, `sent`=blue, `closed`=green, `cancelled`=red.

### 7.2 Item Numbering
- Items in the catalog get a sequential `item_number` (text field storing numeric strings).
- New item numbering: `nextItemNumber()` = `max(existing item_numbers parsed as int) + 1`; if no items exist, starts at `"100001"`.
- `item_number` is copied onto `po_line_items.item_number` when an item is selected on the PO form (denormalized snapshot).

### 7.3 Supplier / Category / Project / Location / Department Relationships
- All five are simple per-company reference/lookup entities, each (except `departments`) with an `active`/`inactive` `status` field.
- Each is referenced by `purchase_orders` via FK with `ON DELETE RESTRICT` — i.e., the DB itself would block deletion if referenced, but the UI proactively checks for usage first and shows a friendly error toast rather than relying on the DB constraint error.
- `categories` are additionally referenced by `items.category_id` (`ON DELETE SET NULL`), so category deletion is also blocked if any items reference it.
- Only `active` suppliers are offered in the PO form's supplier picker (per `PurchaseOrdersPage`'s reference-data load using `.eq('status','active')` — likely the same pattern in `POFormPage`).

### 7.4 Dashboard KPIs / Charts
- Driven entirely by the `get_dashboard_stats` RPC (see Section 3.3).
- KPI cards: Total spend, PO count, Open POs, Average PO value — spend/count metrics only include `issued`/`sent`/`closed` POs (drafts and cancelled excluded from "spend").
- "Open POs" = count of `issued` + `sent` POs, always company-wide regardless of dashboard filters.
- Charts: spend by month (last N months), by category, by supplier, by project, by department, by material/line-item — each a `recharts` `BarChart`, top 8–10 entries.
- Recent POs table always shows the latest 8 company POs regardless of filters.
- Setup checklist (8 items) is shown until all milestones are met; dismissible.

### 7.5 Onboarding Flow
- Sign up (`/register`) → `/onboarding` (2-step wizard: company name → personal name) → RPC `handle_onboarding` creates `companies` row (defaults: `currency='EUR'`, `po_prefix='PO'`, `po_next_number=1`) + `users` row (`is_admin=true`) → `/dashboard`.

### 7.6 Settings Options
- Personal: first/last name.
- Company: name, email, phone, tax ID, full address.
- PO settings: currency (10 options: EUR/USD/GBP/CHF/SEK/NOK/DKK/PLN/CZK/HRK), PO number prefix, next PO number (with live-formatted preview, padded to 4 digits).
- Bank details: bank name, IBAN — used in the PDF footer.

### 7.7 File Attachments
- Attached to POs via `po_attachments` table + `quotations` storage bucket.
- Allowed types: PDF, JPEG, PNG, WebP; max 10MB.
- Storage path convention: `${company_id}/${po_id}/${timestamp}-${sanitized_filename}`.
- Access via 1-hour signed URLs (no public bucket access).
- Upload/list/delete all gated by `company_id = get_my_company_id()` at both the table-RLS and storage-policy levels.

---

## 8. Known Design / Branding State

- **App name:** "Requestio" (in `AppLogo`, legal pages, landing page copy).
- **Color scheme:** Default Tailwind palette — page backgrounds `bg-gray-50`/`bg-white`, primary action color `blue-600` (`#2563eb`), status badges use `gray`/`amber`/`blue`/`green`/`red` shade-100/600-700 pairs.
- **Logo:** 40×40 rounded-square (`rx=10`) blue (`#2563eb`) tile containing a 3-faced abstract isometric cube rendered in white at varying opacities (top face 1.0, left face 0.45, right face 0.7) — an "Airtable-style" abstract box icon. Renders alongside the "Requestio" wordmark (font-semibold, tracking-tight).
- **Typography:** Tailwind default sans-serif stack for UI; "Roboto" custom font registered specifically for the PDF document output.
- **Legal entity referenced:** "TCE, d.o.o." (Slovenian company) as the SaaS provider, with contact `info@tce.si`.
- **PDF branding:** PO PDF uses Slovenian-only labels and the document title "Nabavno naročilo" — tightly coupled to a Slovenian business-document convention, independent of the app's selected UI language.

---

## 9. Known Inconsistencies / Current-State Notes

These are existing discrepancies between the TypeScript types, the SQL schema/migrations, and actual runtime usage in the UI. They should be resolved (or deliberately preserved) as part of any redesign:

1. **`PurchaseOrderStatus` type mismatch** — `src/types/database.ts` defines `PurchaseOrderStatus = 'draft' | 'pending_approval' | 'approved' | 'sent' | 'partially_received' | 'received' | 'cancelled'`, which matches **neither** the SQL CHECK constraint (`'draft','issued','sent','closed','cancelled'`) **nor** actual UI usage (`draft`/`issued`/`sent`/`closed`/`cancelled`). The TS type appears to be leftover from an earlier design iteration and is effectively unused/incorrect.
2. **`purchase_orders.discount_amount`** — read and written throughout `POFormPage.tsx`, `PODetailPage.tsx`, `PODocument.tsx`, and `usePODownload.ts`, but the column is **not defined** in `001_initial_schema.sql` or any subsequent migration. Either an undocumented manual schema change exists in the live DB, or this is a runtime-broken/silently-defaulting field.
3. **`items.default_unit_price`** — used pervasively in `ItemsPage.tsx` and `POFormPage.tsx` (and typed as `number | null` in `types/database.ts`), but **not defined** in `001_initial_schema.sql`'s `items` table. Same category of issue as #2.
4. **`po_attachments` TypeScript type mismatch** — `types/database.ts`'s `PoAttachment` interface declares `uploaded_by`, `file_url`, `file_size_kb`, none of which exist on the actual `po_attachments` table (real columns: `file_path`, `file_name`, `file_size`, no `uploaded_by`).
5. **`generate_po_number(p_company_id)` RPC is missing** — called by `POFormPage.tsx` for new-PO numbering, but not defined in any of the 8 migration files. This is the most significant functional gap found.
6. **`ConfirmDialog` Cancel label bypasses i18n** — uses `localStorage.getItem('lang')` directly instead of `useLanguage()`/`translations`.
7. **`Pagination` "Showing X–Y of Z" is hardcoded English**, not localized.
8. **`PODocument.tsx` (PDF) is hardcoded entirely in Slovenian** regardless of the UI's selected language — by design for the Slovenian "Nabavno naročilo" format, but inconsistent with an otherwise bilingual app.
9. **`AuthGuard.tsx` appears to be dead code** — `App.tsx` does not appear to use it; `AppLayout.tsx` performs its own session-based redirect logic for protected routes.
10. **`purchase_orders.quotation_url`** column (added by `20260531120000_quotation_upload.sql`) appears superseded by the `po_attachments` table (added one migration later) and may be unused/dead.
11. **`PurchaseOrdersPage.tsx` has unreachable "Cancel PO" confirm-dialog code** (`confirmCancel` state + `ConfirmDialog`) with no visible UI trigger setting it — cancellation is actually performed from `PODetailPage.tsx`. Likely dead code left over from a refactor.
12. **`PrivacyPage.tsx`/`TermsPage.tsx` do not use `translations.ts`** — they implement bilingual text via inline ternaries, separate from the rest of the app's i18n architecture.

---

*End of specification.*
