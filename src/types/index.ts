export type Role = 'employee' | 'management'

export type Profile = {
  id: string
  full_name: string
  role: Role
  email?: string
}

export type DocumentRecord = {
  id: string
  title: string
  description: string | null
  file_path: string
  created_at: string
  created_by: string
}

export type Assignment = { document_id: string; employee_id: string }

export type Signature = {
  id: string
  document_id: string
  employee_id: string
  signed_at: string
  signature_text: string
  signed_file_path: string
}

export type DocumentState = DocumentRecord & {
  assignees: Profile[]
  signatures: Signature[]
}
