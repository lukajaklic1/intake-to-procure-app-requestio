export interface Company {
  id: string
  name: string
  currency: string
  po_prefix: string
  po_next_number: number
  address_street: string | null
  address_city: string | null
  address_postal_code: string | null
  address_country: string | null
  email: string | null
  phone: string | null
  tax_id: string | null
  logo_url: string | null
  bank_name: string | null
  bank_iban: string | null
  approval_auto_under: number | null
  approval_second_over: number | null
  team_edit_requests: boolean
  created_at: string
  updated_at: string
}

export interface User {
  id: string
  company_id: string
  first_name: string
  last_name: string
  email: string
  phone: string | null
  is_admin: boolean
  department_id: string | null
  job_title: string | null
  created_at: string
  updated_at: string
}

export interface Supplier {
  id: string
  company_id: string
  name: string
  vat_number: string | null
  contact_name: string | null
  email: string | null
  phone: string | null
  address_street: string | null
  address_city: string | null
  address_postal_code: string | null
  address_country: string | null
  payment_terms: string | null
  status: 'active' | 'inactive'
  created_at: string
  updated_at: string
}

export interface Category {
  id: string
  company_id: string
  name: string
  created_at: string
  updated_at: string
}

export interface Project {
  id: string
  company_id: string
  name: string
  project_code: string | null
  customer: string | null
  start_date: string | null
  end_date: string | null
  status: 'active' | 'inactive'
  budget_amount: number | null
  manager_id: string | null
  created_at: string
  updated_at: string
}

export interface Location {
  id: string
  company_id: string
  name: string
  address_street: string | null
  address_city: string | null
  address_postal_code: string | null
  address_country: string | null
  status: 'active' | 'inactive'
  created_at: string
  updated_at: string
}

export interface Department {
  id: string
  company_id: string
  name: string
  created_at: string
  updated_at: string
}

export interface Item {
  id: string
  company_id: string
  item_number: string
  name: string
  long_description: string | null
  category_id: string | null
  default_unit: string | null
  default_unit_price: number | null
  status: 'active' | 'inactive'
  created_at: string
  updated_at: string
}

export type PurchaseOrderStatus =
  | 'draft'
  | 'issued'
  | 'sent'
  | 'closed'
  | 'cancelled'

export interface PurchaseOrder {
  id: string
  company_id: string
  created_by: string
  po_number: string
  status: PurchaseOrderStatus
  supplier_id: string
  category_id: string | null
  location_id: string | null
  project_id: string | null
  department_id: string | null
  payment_terms: string | null
  expected_delivery_date: string | null
  incoterm: string | null
  supplier_quote_ref: string | null
  notes: string | null
  delivery_notes: string | null
  total_amount: number
  discount_amount: number
  request_id: string | null
  created_at: string
  updated_at: string
}

export interface PoLineItem {
  id: string
  po_id: string
  item_id: string | null
  position: number
  name: string
  long_description: string | null
  quantity: number
  unit: string
  unit_price: number
  line_total: number
  created_at: string
}

export interface PoAttachment {
  id: string
  po_id: string
  company_id: string
  file_path: string
  file_name: string
  file_size: number | null
  created_at: string
}

export interface UserPermission {
  id: string
  user_id: string
  module: 'requests' | 'purchase_orders' | 'receipts' | 'invoices' | 'budgets' | 'reports'
  can_view: boolean
  can_create: boolean
  can_approve: boolean
  can_pay: boolean
}

export interface InvitationPermission {
  module: UserPermission['module']
  can_view: boolean
  can_create: boolean
  can_approve: boolean
  can_pay: boolean
}

export interface UserInvitation {
  id: string
  company_id: string
  email: string
  token: string
  invited_by: string
  is_admin: boolean
  first_name: string | null
  last_name: string | null
  department_id: string | null
  job_title: string | null
  permissions: InvitationPermission[] | null
  status: 'pending' | 'accepted' | 'revoked'
  created_at: string
  accepted_at: string | null
}

export interface Database {
  public: {
    Tables: {
      companies: { Row: Company; Insert: Omit<Company, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Omit<Company, 'id'>> }
      users: { Row: User; Insert: Omit<User, 'created_at' | 'updated_at'>; Update: Partial<Omit<User, 'id'>> }
      suppliers: { Row: Supplier; Insert: Omit<Supplier, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Omit<Supplier, 'id'>> }
      categories: { Row: Category; Insert: Omit<Category, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Omit<Category, 'id'>> }
      projects: { Row: Project; Insert: Omit<Project, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Omit<Project, 'id'>> }
      locations: { Row: Location; Insert: Omit<Location, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Omit<Location, 'id'>> }
      departments: { Row: Department; Insert: Omit<Department, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Omit<Department, 'id'>> }
      items: { Row: Item; Insert: Omit<Item, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Omit<Item, 'id'>> }
      purchase_orders: { Row: PurchaseOrder; Insert: Omit<PurchaseOrder, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Omit<PurchaseOrder, 'id'>> }
      po_line_items: { Row: PoLineItem; Insert: Omit<PoLineItem, 'id' | 'created_at' | 'line_total'>; Update: Partial<Omit<PoLineItem, 'id' | 'line_total'>> }
      po_attachments: { Row: PoAttachment; Insert: Omit<PoAttachment, 'id' | 'created_at'>; Update: Partial<Omit<PoAttachment, 'id'>> }
      user_permissions: { Row: UserPermission; Insert: Omit<UserPermission, 'id'>; Update: Partial<Omit<UserPermission, 'id'>> }
      user_invitations: { Row: UserInvitation; Insert: Omit<UserInvitation, 'id' | 'created_at'>; Update: Partial<Omit<UserInvitation, 'id'>> }
    }
  }
}
