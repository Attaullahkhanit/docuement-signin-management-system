# Papertrail — Document signing & management

A React + TypeScript app backed by Supabase for assigning PDF documents, collecting electronic signatures, and tracking completion.

## Features

- Employee and management roles, with employee access as the safe default.
- Management can upload PDFs, assign them to employees, see who has signed, and download original and signed copies.
- Employees can review their assigned PDF, sign with their typed name, and submit it.
- A signature submission appends an electronic-signature page to the original PDF with the signer name, account email, timestamp, and document ID.
- Private Supabase Storage buckets and row-level security policies protect documents and signature records.

## Run locally

1. Install Node.js 20 or newer.
2. Create a Supabase project.
3. Run [`supabase/schema.sql`](./supabase/schema.sql) in the Supabase SQL Editor.
4. In the Supabase dashboard, open **Project Settings → API** and copy the **Project URL** and the **anon / publishable key**. Put them in `.env.local` (copy `.env.example` first):

   ```dotenv
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-or-publishable-key
   ```

   These are the browser-safe project values. **Do not use or share the `service_role` secret**; this app does not need it.
5. Install dependencies and start the app:

   ```sh
   npm install
   npm run dev
   ```

6. Create a real account through the app's sign-up form. Supabase Auth handles sign-in and passwords; new accounts receive the employee role automatically. To grant management access, promote a trusted account using the SQL example at the end of `supabase/schema.sql`.

If email confirmation is enabled in Supabase Auth, confirm the account from the email before signing in.

### Supabase values and setup checklist

- **Required to connect this project:** Supabase Project URL and anon/publishable key.
- **Required in the Supabase project:** run `supabase/schema.sql`; it creates the profile/document/signature tables, row-level security policies, and private storage buckets.
- **To use management features:** create/sign into the management user's account, then promote that account with the SQL example. New sign-ups cannot grant themselves management access.
- **For production email confirmation:** configure Supabase Auth email/SMTP settings in your Supabase project.
- **Never needed in the frontend:** database password or service-role key.

## Project structure

```text
src/
  components/
    ui/                 # shadcn-style reusable UI components
  features/
    auth/               # Supabase setup screen
    dashboard/          # Dashboard statistics
    documents/
      components/       # Document status and signing actions
  lib/                  # Supabase client, PDF signing, shared utilities
  types/                # Shared application types
  App.tsx               # App shell and workflow orchestration
  main.tsx              # React/Vite entry point
  styles.css            # Tailwind layers and app design styles
supabase/
  schema.sql            # Tables, RLS policies, and private storage setup
```

The UI is configured with Tailwind CSS and shadcn/ui conventions (`components.json`, CSS variables, and reusable local components).

## Signature note

This starter records a typed electronic signature and appends an audit page to the submitted PDF. It does not embed a cryptographic certificate or claim legal compliance for a specific jurisdiction. Review your organization's e-signature and retention requirements before production use.
