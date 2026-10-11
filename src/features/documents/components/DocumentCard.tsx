import {
  ArrowDownToLine,
  ArrowRight,
  CheckCircle2,
  FileCheck2,
  FileText,
} from 'lucide-react'
import { dateLabel, initials } from '@/lib/format'
import type { DocumentState } from '@/types'

type DocumentCardProps = {
  doc: DocumentState
  isManager: boolean
  currentUserId: string
  onSign: () => void
  onDownload: (path?: string) => void
}

export function DocumentCard({
  doc,
  isManager,
  currentUserId,
  onSign,
  onDownload,
}: DocumentCardProps) {
  const ownSignature = doc.signatures.find((signature) => signature.employee_id === currentUserId)
  const signedCount = doc.signatures.length
  const pendingCount = Math.max(0, doc.assignees.length - signedCount)
  const signerNames = doc.signatures
    .map((signature) => doc.assignees.find((person) => person.id === signature.employee_id)?.full_name)
    .filter(Boolean)
    .join(', ')

  return (
    <article className="document-card">
      <div className="doc-main">
        <div className="doc-icon"><FileText size={20} /></div>
        <div className="doc-info">
          <div className="doc-title-row">
            <h3>{doc.title}</h3>
            {!isManager && (
              <span className={`status-pill ${ownSignature ? 'status-signed' : 'status-pending'}`}>
                <span />{ownSignature ? 'Signed' : 'Needs your signature'}
              </span>
            )}
          </div>
          {doc.description && <p className="doc-description">{doc.description}</p>}
          <div className="doc-meta">
            <span>Added {dateLabel(doc.created_at)}</span><span className="meta-dot">·</span>
            <span>PDF document</span>
            {isManager && <>
              <span className="meta-dot">·</span>
              <span>{doc.assignees.length} {doc.assignees.length === 1 ? 'assignee' : 'assignees'}</span>
            </>}
          </div>
        </div>
      </div>
      {isManager ? (
        <div className="manager-status">
          <div className="avatar-stack">
            {doc.assignees.slice(0, 4).map((person) => (
              <span title={person.full_name} className="avatar stack-avatar" key={person.id}>
                {initials(person.full_name || 'U')}
              </span>
            ))}
            {doc.assignees.length > 4 && <span className="avatar stack-avatar more-avatar">+{doc.assignees.length - 4}</span>}
          </div>
          <div className="signed-summary">
            <span className="signed-number">{signedCount} signed</span>
            <span>{pendingCount} pending</span>
            <span title={signerNames}>By: {signerNames || 'No one yet'}</span>
          </div>
          <div className="manager-actions">
            <button className="button secondary compact-button" onClick={() => onDownload()}>
              <ArrowDownToLine size={15} /> Original
            </button>
            {doc.signatures.map((signature) => {
              const signer = doc.assignees.find((person) => person.id === signature.employee_id)?.full_name ?? 'employee'
              return (
                <button
                  className="icon-button download-signed"
                  key={signature.id}
                  title={`Download signed PDF (${signer})`}
                  aria-label={`Download signed PDF from ${signer}`}
                  onClick={() => onDownload(signature.signed_file_path)}
                >
                  <FileCheck2 size={17} />
                </button>
              )
            })}
          </div>
        </div>
      ) : ownSignature ? (
        <div className="employee-actions">
          <span className="signed-date"><CheckCircle2 size={15} /> Signed {dateLabel(ownSignature.signed_at)}</span>
          <button className="button secondary compact-button" onClick={() => onDownload(ownSignature.signed_file_path)}>
            <ArrowDownToLine size={15} /> Signed PDF
          </button>
        </div>
      ) : (
        <div className="employee-actions">
          <button className="button primary compact-button" onClick={onSign}>Review & sign <ArrowRight size={15} /></button>
        </div>
      )}
    </article>
  )
}
