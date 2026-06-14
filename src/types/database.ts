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
  second_approver_id: string | null
  team_edit_requests: boolean
  req_prefix: string
  req_next_number: number
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

export type RequestStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'cancelled'

export interface Request {
  id: string
  company_id: string
  request_number: string
  created_by: string
  project_id: string
  supplier_id: string | null
  supplier_name: string | null
  category_id: string | null
  location_id: string | null
  department_id: string | null
  needed_by_date: string | null
  note: string | null
  discount_amount: number
  total_estimate: number
  status: RequestStatus
  approver_id: string | null
  decided_by: string | null
  decided_at: string | null
  decision_note: string | null
  po_id: string | null
  created_at: string
  updated_at: string
}

export interface RequestLineItem {
  id: string
  request_id: string
  item_id: string | null
  position: number
  name: string
  long_description: string | null
  quantity: number
  unit: string
  est_unit_price: number
  line_total: number
  created_at: string
}

export interface RequestAttachment {
  id: string
  request_id: string
  company_id: string
  file_path: string
  file_name: string
  file_size: number | null
  created_at: string
}

export interface ActivityLog {
  id: string
  company_id: string
  request_id: string
  actor_id: string | null
  action: 'created' | 'edited' | 'submitted' | 'approved' | 'rejected' | 'cancelled' | 'po_created'
  note: string | null
  meta: { step?: number; po_id?: string; po_number?: string } | null
  created_at: string
}

export type ApprovalStatus = 'pending' | 'approved' | 'rejected'

export interface Approval {
  id: string
  request_id: string
  step: number
  approver_id: string
  status: ApprovalStatus
  decided_at: string | null
  decision_note: string | null
  created_at: string
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
      requests: { Row: Request; Insert: Omit<Request, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Omit<Request, 'id'>> }
      request_line_items: { Row: RequestLineItem; Insert: Omit<RequestLineItem, 'id' | 'created_at' | 'line_total'>; Update: Partial<Omit<RequestLineItem, 'id' | 'line_total'>> }
      approvals: { Row: Approval; Insert: Omit<Approval, 'id' | 'created_at'>; Update: Partial<Omit<Approval, 'id'>> }
      request_attachments: { Row: RequestAttachment; Insert: Omit<RequestAttachment, 'id' | 'created_at'>; Update: Partial<Omit<RequestAttachment, 'id'>> }
      activity_log: { Row: ActivityLog; Insert: Omit<ActivityLog, 'id' | 'created_at'>; Update: Partial<Omit<ActivityLog, 'id'>> }
    }
  }
}
