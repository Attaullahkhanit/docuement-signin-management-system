import { FileCheck2, ShieldCheck } from 'lucide-react'

export function SetupScreen() {
  return (
    <main className="setup-screen">
      <div className="setup-card">
        <div className="brand-mark"><FileCheck2 size={22} /></div>
        <span className="eyebrow">ONE QUICK SETUP</span>
        <h1>Connect your Supabase project</h1>
        <p>Papertrail needs your Supabase project URL and anon key to securely store accounts, documents, and signatures.</p>
        <ol>
          <li>Copy <code>.env.example</code> to <code>.env.local</code>.</li>
          <li>Fill in <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>.</li>
          <li>Run the SQL in <code>supabase/schema.sql</code> in your Supabase SQL Editor.</li>
        </ol>
        <p className="setup-note"><ShieldCheck size={16} /> Never put your Supabase service-role key in this app.</p>
      </div>
    </main>
  )
}
