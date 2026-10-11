import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  ArrowRight,
  Check,
  CheckCircle2,
  CircleHelp,
  Clock3,
  FileCheck2,
  FileText,
  FolderOpen,
  LogOut,
  Plus,
  Search,
  ShieldCheck,
  Upload,
  Users,
  X,
} from 'lucide-react'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import { Button } from './components/ui/button'
import { dateLabel, initials } from './lib/format'
import type { Assignment, DocumentRecord, DocumentState, Profile, Signature } from './types'
import { SetupScreen } from './features/auth/SetupScreen'
import { StatCard } from './features/dashboard/StatCard'
import { DocumentCard } from './features/documents/components/DocumentCard'

function matchesDocumentTab(
  doc: DocumentState,
  tab: 'all' | 'pending' | 'completed',
  userId: string,
  isManager: boolean,
) {
  if (tab === 'all') return true
  const signedBy = (employeeId: string) =>
    doc.signatures.some((signature) => signature.employee_id === employeeId)
  if (isManager) {
    const completed = doc.assignees.length > 0 && doc.assignees.every((person) => signedBy(person.id))
    return tab === 'completed' ? completed : !completed
  }
  return tab === 'completed' ? signedBy(userId) : !signedBy(userId)
}

function App() {
  const [session, setSession] = useState<Awaited<ReturnType<NonNullable<typeof supabase>['auth']['getSession']>>['data']['session']>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [documents, setDocuments] = useState<DocumentState[]>([])
  const [employees, setEmployees] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'completed'>('all')
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin')
  const [showCreate, setShowCreate] = useState(false)
  const [selectedDocument, setSelectedDocument] = useState<DocumentState | null>(null)
  const [pdfPreview, setPdfPreview] = useState<{ title: string; url: string } | null>(null)
  const [signingName, setSigningName] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [authFields, setAuthFields] = useState({ name: '', email: '', password: '' })

  const loadWorkspace = useCallback(async (user: NonNullable<typeof session>) => {
    if (!supabase) return
    setLoading(true)
    setError('')
    try {
      const { data: ownProfile, error: profileError } = await supabase
        .from('profiles').select('id, full_name, role').eq('id', user.user.id).single()
      if (profileError) throw profileError
      setProfile(ownProfile as Profile)

      const [documentResult, assignmentResult, signatureResult, employeeResult] = await Promise.all([
        supabase.from('documents').select('*').order('created_at', { ascending: false }),
        supabase.from('document_assignments').select('document_id, employee_id'),
        supabase.from('signatures').select('*').order('signed_at', { ascending: false }),
        ownProfile.role === 'management'
          ? supabase.from('profiles').select('id, full_name, role').eq('role', 'employee').order('full_name')
          : Promise.resolve({ data: [], error: null }),
      ])
      if (documentResult.error) throw documentResult.error
      if (assignmentResult.error) throw assignmentResult.error
      if (signatureResult.error) throw signatureResult.error
      if (employeeResult.error) throw employeeResult.error

      const assignmentNames = await supabase.from('profiles').select('id, full_name, role')
      if (assignmentNames.error) throw assignmentNames.error
      const people = (assignmentNames.data ?? []) as Profile[]
      const assignmentRows = (assignmentResult.data ?? []) as Assignment[]
      const signatureRows = (signatureResult.data ?? []) as Signature[]
      setEmployees((employeeResult.data ?? []) as Profile[])
      setDocuments(((documentResult.data ?? []) as DocumentRecord[]).map((doc) => ({
        ...doc,
        assignees: assignmentRows
          .filter((row) => row.document_id === doc.id)
          .map((row) => people.find((person) => person.id === row.employee_id))
          .filter((person): person is Profile => Boolean(person)),
        signatures: signatureRows.filter((row) => row.document_id === doc.id),
      })))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load your workspace.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession)
      if (nextSession && ['INITIAL_SESSION', 'SIGNED_IN', 'USER_UPDATED'].includes(event)) {
        window.setTimeout(() => void loadWorkspace(nextSession), 0)
      } else if (!nextSession) {
        setProfile(null)
        setDocuments([])
        setEmployees([])
        setLoading(false)
      }
    })
    return () => {
      listener.subscription.unsubscribe()
    }
  }, [loadWorkspace])

  const visibleDocuments = useMemo(() => documents.filter((doc) => {
    const matchesTab = session
      ? matchesDocumentTab(doc, activeTab, session.user.id, profile?.role === 'management')
      : activeTab === 'all'
    const matchesQuery = `${doc.title} ${doc.description ?? ''}`.toLowerCase().includes(query.toLowerCase())
    return matchesTab && matchesQuery
  }), [documents, activeTab, query, session, profile])

  const stats = useMemo(() => ({
    total: documents.length,
    pending: documents.reduce((total, doc) => total + doc.assignees.filter(
      (person) => !doc.signatures.some((signature) => signature.employee_id === person.id),
    ).length, 0),
    signed: documents.reduce((total, doc) => total + doc.signatures.length, 0),
  }), [documents])

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    setBusy(true)
    setError('')
    try {
      if (authMode === 'signup') {
        const { error: signUpError } = await supabase.auth.signUp({
          email: authFields.email,
          password: authFields.password,
          options: { data: { full_name: authFields.name.trim() } },
        })
        if (signUpError) throw signUpError
        setNotice('Account created. Check your email to confirm your address, then sign in.')
        setAuthMode('signin')
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: authFields.email,
          password: authFields.password,
        })
        if (signInError) throw signInError
      }
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Authentication failed.')
    } finally {
      setBusy(false)
    }
  }

  async function signOut() {
    if (!supabase) return
    const { error: signOutError } = await supabase.auth.signOut()
    if (signOutError) setError(signOutError.message)
  }

  async function createDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !profile) return
    const form = new FormData(event.currentTarget)
    const title = String(form.get('title') ?? '').trim()
    const description = String(form.get('description') ?? '').trim()
    const file = form.get('file')
    const assigneeIds = form.getAll('assignees').map(String)
    if (!(file instanceof File) || file.size === 0) {
      setError('Choose a PDF to upload.')
      return
    }
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Only PDF files can be uploaded.')
      return
    }
    if (assigneeIds.length === 0) {
      setError('Assign this document to at least one employee.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const { data: doc, error: insertError } = await supabase.from('documents')
        .insert({ title, description: description || null, file_path: '', created_by: profile.id })
        .select().single()
      if (insertError) throw insertError
      const { error: uploadError } = await supabase.storage.from('documents').upload(`${doc.id}.pdf`, file, {
        contentType: 'application/pdf',
        upsert: false,
      })
      if (uploadError) {
        await supabase.from('documents').delete().eq('id', doc.id)
        throw uploadError
      }
      const { error: pathError } = await supabase.from('documents').update({ file_path: `${doc.id}.pdf` }).eq('id', doc.id)
      if (pathError) throw pathError
      const { error: assignError } = await supabase.from('document_assignments')
        .insert(assigneeIds.map((employee_id) => ({ document_id: doc.id, employee_id })))
      if (assignError) throw assignError
      setShowCreate(false)
      setNotice('Document uploaded and assigned.')
      await loadWorkspace(session!)
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Could not create the document.')
    } finally {
      setBusy(false)
    }
  }

  async function openPdf(doc: DocumentState, signedPath?: string) {
    if (!supabase) return
    setBusy(true)
    setError('')
    try {
      const bucket = signedPath ? 'signed-documents' : 'documents'
      const path = signedPath ?? doc.file_path
      const { data, error: downloadError } = await supabase.storage.from(bucket).download(path)
      if (downloadError) throw downloadError
      const url = URL.createObjectURL(data)
      const link = document.createElement('a')
      link.href = url
      link.download = signedPath ? `${doc.title.replace(/[^\w-]+/g, '_')}-signed.pdf` : `${doc.title.replace(/[^\w-]+/g, '_')}.pdf`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : 'Could not download this PDF.')
    } finally {
      setBusy(false)
    }
  }

  async function previewPdf(doc: DocumentState) {
    if (!supabase) return
    setBusy(true)
    setError('')
    try {
      const { data, error: downloadError } = await supabase.storage.from('documents').download(doc.file_path)
      if (downloadError) throw downloadError
      if (pdfPreview) URL.revokeObjectURL(pdfPreview.url)
      setPdfPreview({ title: doc.title, url: URL.createObjectURL(data) })
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : 'Could not open this PDF.')
    } finally {
      setBusy(false)
    }
  }

  function closePdfPreview() {
    if (pdfPreview) URL.revokeObjectURL(pdfPreview.url)
    setPdfPreview(null)
  }

  async function submitSignature(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !session || !selectedDocument || !signingName.trim() || !accepted) return
    setBusy(true)
    setError('')
    let signedPath = ''
    try {
      const { data: original, error: downloadError } = await supabase.storage
        .from('documents').download(selectedDocument.file_path)
      if (downloadError) throw downloadError
      const { createSignedPdf } = await import('./lib/create-signed-pdf')
      const signedBytes = await createSignedPdf(original, {
        title: selectedDocument.title,
        signerName: signingName.trim(),
        email: session.user.email ?? session.user.id,
        documentId: selectedDocument.id,
      })
      signedPath = `${selectedDocument.id}/${session.user.id}.pdf`
      const { error: uploadError } = await supabase.storage.from('signed-documents').upload(
        signedPath, new Blob([signedBytes], { type: 'application/pdf' }), { contentType: 'application/pdf', upsert: false },
      )
      if (uploadError) throw uploadError
      const { error: signatureError } = await supabase.from('signatures').insert({
        document_id: selectedDocument.id,
        employee_id: session.user.id,
        signature_text: signingName.trim(),
        signed_file_path: signedPath,
      })
      if (signatureError) {
        const { error: cleanupError } = await supabase.storage.from('signed-documents').remove([signedPath])
        if (cleanupError) {
          throw new Error(`${signatureError.message} The uploaded PDF could not be removed: ${cleanupError.message}`)
        }
        throw signatureError
      }
      setSelectedDocument(null)
      setSigningName('')
      setAccepted(false)
      setNotice('Signature submitted. Your signed PDF is ready to download.')
      await loadWorkspace(session)
    } catch (signatureError) {
      setError(signatureError instanceof Error ? signatureError.message : 'Could not submit your signature.')
    } finally {
      setBusy(false)
    }
  }

  if (!isSupabaseConfigured) return <SetupScreen />
  if (!session || !profile) {
    if (loading && session) return <div className="loading-screen"><span className="spinner" />Loading your workspace…</div>
    return (
      <main className="auth-layout">
        <section className="auth-brand">
          <div className="brand-mark"><FileCheck2 size={22} /></div>
          <span className="brand-name">papertrail</span>
          <div className="auth-message">
            <span className="eyebrow">DOCUMENTS, DONE RIGHT</span>
            <h1>Good work<br />deserves a<br /><em>clear signature.</em></h1>
            <p>One calm place to send, sign, and keep track of the paperwork that moves your team forward.</p>
          </div>
          <div className="auth-footer"><ShieldCheck size={16} /> Private by design. Built for your team.</div>
        </section>
        <section className="auth-panel">
          <div className="auth-form-wrap">
            <div className="mobile-brand"><div className="brand-mark"><FileCheck2 size={20} /></div><span className="brand-name">papertrail</span></div>
            <span className="eyebrow">{authMode === 'signin' ? 'WELCOME BACK' : 'GET STARTED'}</span>
            <h2>{authMode === 'signin' ? 'Sign in to your account' : 'Create your account'}</h2>
            <p className="muted">{authMode === 'signin' ? 'Your team’s documents are right where you left them.' : 'New accounts start with employee access.'}</p>
            {error && <div className="alert error-alert">{error}</div>}
            {notice && <div className="alert success-alert">{notice}</div>}
            <form onSubmit={handleAuth} className="stack-form">
              {authMode === 'signup' && <label>Full name<input required autoComplete="name" value={authFields.name} onChange={(e) => setAuthFields({ ...authFields, name: e.target.value })} placeholder="Your name" /></label>}
              <label>Work email<input required type="email" autoComplete="email" value={authFields.email} onChange={(e) => setAuthFields({ ...authFields, email: e.target.value })} placeholder="you@company.com" /></label>
              <label>Password<input required type="password" minLength={6} autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'} value={authFields.password} onChange={(e) => setAuthFields({ ...authFields, password: e.target.value })} placeholder="At least 6 characters" /></label>
              <Button type="submit" className="button primary full-button" disabled={busy}>{busy ? 'Please wait…' : authMode === 'signin' ? 'Sign in' : 'Create account'} <ArrowRight size={16} /></Button>
            </form>
            <p className="auth-switch">{authMode === 'signin' ? 'New to Papertrail?' : 'Already have an account?'} <button onClick={() => { setAuthMode(authMode === 'signin' ? 'signup' : 'signin'); setError(''); setNotice('') }}>{authMode === 'signin' ? 'Create an account' : 'Sign in'}</button></p>
          </div>
        </section>
      </main>
    )
  }

  const isManager = profile.role === 'management'
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#"><span className="brand-mark"><FileCheck2 size={20} /></span><span className="brand-name">papertrail</span></a>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="side-nav">
          <button className="nav-item selected"><FolderOpen size={18} /> Documents <span className="nav-count">{documents.length}</span></button>
          {isManager && <div className="nav-item nav-static"><Users size={18} /> Team overview</div>}
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card"><div className="help-icon"><CircleHelp size={17} /></div><strong>Need a hand?</strong><span>Your team workspace, all in one place.</span></div>
          <button className="profile-menu" onClick={() => void signOut()}>
            <span className="avatar">{initials(profile.full_name || session.user.email || 'U')}</span>
            <span className="profile-copy"><strong>{profile.full_name || 'Team member'}</strong><small>{isManager ? 'Management' : 'Employee'}</small></span>
            <LogOut size={16} className="logout-icon" />
          </button>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar"><div className="breadcrumb">Workspace <span>/</span> <strong>Documents</strong></div><div className="topbar-right"><span className="secure-label"><ShieldCheck size={15} /> Secure workspace</span><span className="avatar small-avatar">{initials(profile.full_name || 'U')}</span></div></header>
        <div className="page-content">
          {error && <div className="alert error-alert dismiss-alert">{error}<button aria-label="Dismiss error" onClick={() => setError('')}><X size={16} /></button></div>}
          {notice && <div className="alert success-alert dismiss-alert"><CheckCircle2 size={16} />{notice}<button aria-label="Dismiss message" onClick={() => setNotice('')}><X size={16} /></button></div>}
          <div className="page-heading">
            <div><span className="eyebrow">YOUR WORKSPACE</span><h1>{isManager ? 'Document overview' : 'Your documents'}</h1><p>{isManager ? 'Send documents out and keep every signature on track.' : 'Everything you need to review and sign, in one place.'}</p></div>
            {isManager && <Button className="button primary" onClick={() => { setError(''); setShowCreate(true) }}><Plus size={17} /> New document</Button>}
          </div>

          <section className="stat-grid">
            <StatCard label={isManager ? 'Documents' : 'Assigned to you'} value={stats.total} icon={<FileText size={18} />} tone="sage" />
            <StatCard label={isManager ? 'Awaiting signature' : 'Awaiting your signature'} value={isManager ? stats.pending : documents.filter((doc) => !doc.signatures.some((signature) => signature.employee_id === session.user.id)).length} icon={<Clock3 size={18} />} tone="amber" />
            <StatCard label={isManager ? 'Signatures received' : 'Signed by you'} value={isManager ? stats.signed : documents.filter((doc) => doc.signatures.some((signature) => signature.employee_id === session.user.id)).length} icon={<CheckCircle2 size={18} />} tone="blue" />
          </section>

          {isManager && <section className="progress-card"><div className="progress-intro"><div className="progress-icon"><Users size={18} /></div><div><strong>Team signing progress</strong><p>{stats.signed} of {stats.signed + stats.pending} assigned signatures completed</p></div></div><div className="progress-track"><span style={{ width: `${stats.signed + stats.pending === 0 ? 0 : Math.round(stats.signed / (stats.signed + stats.pending) * 100)}%` }} /></div><span className="progress-percent">{stats.signed + stats.pending === 0 ? 0 : Math.round(stats.signed / (stats.signed + stats.pending) * 100)}%</span></section>}

          <section className="documents-section">
            <div className="section-heading"><div><h2>{isManager ? 'All documents' : 'Your assignments'}</h2><span>{isManager ? `${documents.length} documents in your workspace` : `${documents.length} documents assigned to you`}</span></div><div className="search-box"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search documents" /></div></div>
            <div className="tabs" role="tablist">
              {(['all', 'pending', 'completed'] as const).map((tab) => <button key={tab} role="tab" aria-selected={activeTab === tab} className={activeTab === tab ? 'tab active-tab' : 'tab'} onClick={() => setActiveTab(tab)}>{tab === 'all' ? 'All documents' : tab === 'pending' ? 'Needs signing' : 'Completed'}<span>{documents.filter((doc) => matchesDocumentTab(doc, tab, session.user.id, isManager)).length}</span></button>)}
            </div>
            {loading ? <div className="loading-inline"><span className="spinner" /> Loading documents…</div> : visibleDocuments.length === 0 ?             <div className="empty-state"><div className="empty-icon"><FileText size={22} /></div><strong>{query ? 'No matching documents' : activeTab === 'completed' ? 'Nothing signed just yet' : 'Your document list is clear'}</strong><p>{query ? 'Try a different search term.' : isManager ? 'Upload a PDF and assign it to your team to get started.' : 'When a document is assigned to you, it will show up here.'}</p>{isManager && !query && <Button variant="secondary" className="button secondary" onClick={() => setShowCreate(true)}><Plus size={16} /> Add your first document</Button>}</div> : (
              <div className="document-list">{visibleDocuments.map((doc) => <DocumentCard key={doc.id} doc={doc} isManager={isManager} currentUserId={session.user.id} onSign={() => { setSelectedDocument(doc); setSigningName(profile.full_name); setAccepted(false); setError('') }} onDownload={(path) => void openPdf(doc, path)} />)}</div>
            )}
          </section>
          <footer className="page-footer"><span>Papertrail <span className="footer-dot">·</span> Documents are stored securely in your workspace.</span><span><ShieldCheck size={14} /> Your data stays private</span></footer>
        </div>
      </main>

      {showCreate && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowCreate(false) }}><section className="modal"><div className="modal-header"><div><span className="eyebrow">SHARE WITH YOUR TEAM</span><h2>New document</h2></div><button className="icon-button" aria-label="Close dialog" onClick={() => setShowCreate(false)}><X size={19} /></button></div><p className="modal-subtitle">Upload a PDF and choose who needs to sign it.</p><form onSubmit={createDocument} className="stack-form">
        <label>Document name<input name="title" required maxLength={120} placeholder="e.g. Employee handbook 2026" /></label>
        <label>Short description <span className="optional-label">Optional</span><textarea name="description" rows={2} maxLength={500} placeholder="Add context for your team…" /></label>
        <label className="upload-box"><Upload size={20} /><strong>Choose a PDF to upload</strong><span>PDF format only · Up to 20 MB</span><input name="file" type="file" accept="application/pdf,.pdf" required onChange={(e) => { const f = e.target.files?.[0]; if (f && f.size > 20 * 1024 * 1024) { setError('PDFs must be 20 MB or smaller.'); e.target.value = '' } else setError('') }} /></label>
        <fieldset className="assignee-field"><legend>Assign to <span className="optional-label">Select one or more employees</span></legend><div className="assignee-list">{employees.length === 0 ? <p className="muted small-copy">No employee accounts yet. Ask your team to create accounts first.</p> : employees.map((employee) => <label className="assignee-option" key={employee.id}><input type="checkbox" name="assignees" value={employee.id} /><span className="avatar mini-avatar">{initials(employee.full_name || 'U')}</span><span>{employee.full_name || 'Team member'}</span><Check size={15} className="assignee-check" /></label>)}</div></fieldset>
        <div className="modal-actions"><Button variant="secondary" className="button secondary" onClick={() => setShowCreate(false)}>Cancel</Button><Button type="submit" className="button primary" disabled={busy || employees.length === 0}><Upload size={16} />{busy ? 'Uploading…' : 'Upload and assign'}</Button></div>
      </form></section></div>}

      {selectedDocument && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setSelectedDocument(null) }}><section className="modal sign-modal"><div className="modal-header"><div><span className="eyebrow">REVIEW & SIGN</span><h2>Sign this document</h2></div><button className="icon-button" aria-label="Close dialog" onClick={() => setSelectedDocument(null)}><X size={19} /></button></div><p className="modal-subtitle">Review the original PDF before signing. A signature page with your name and timestamp will be appended to the PDF you submit.</p><div className="review-file"><div className="file-icon"><FileText size={19} /></div><div><strong>{selectedDocument.title}</strong><span>{selectedDocument.description || 'PDF document'} · Added {dateLabel(selectedDocument.created_at)}</span></div><button className="button secondary compact-button" type="button" onClick={() => void previewPdf(selectedDocument)} disabled={busy}><FileText size={15} /> Review PDF</button></div><form onSubmit={submitSignature} className="stack-form">
        <label>Type your full legal name<input required value={signingName} onChange={(e) => setSigningName(e.target.value)} placeholder="Your full name" /></label>
        <div className="signature-preview"><span>ELECTRONIC SIGNATURE</span><strong>{signingName || 'Your name'}</strong></div>
        <label className="consent-row"><input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} /><span>I have reviewed this document and agree to sign it electronically.</span></label>
        <div className="modal-actions"><Button variant="secondary" className="button secondary" onClick={() => setSelectedDocument(null)}>Cancel</Button><Button type="submit" className="button primary" disabled={busy || !accepted || !signingName.trim()}><FileCheck2 size={16} />{busy ? 'Submitting…' : 'Sign and submit'}</Button></div>
      </form></section></div>}

      {pdfPreview && <div className="modal-backdrop preview-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) closePdfPreview() }}><section className="pdf-preview-modal"><header><strong>{pdfPreview.title}</strong><button className="icon-button" aria-label="Close PDF preview" onClick={closePdfPreview}><X size={19} /></button></header><iframe title={`PDF preview: ${pdfPreview.title}`} src={pdfPreview.url} /></section></div>}
    </div>
  )
}

export default App
