# MEDENZA '27 Attendance Register

Vite + React attendance dashboard hosted with GitHub Pages. Meeting and attendance edits are shared through Supabase; the browser also keeps a local copy and supports JSON backup import/export.

## Configure shared storage

1. Create a Supabase project.
2. In the Supabase SQL Editor, run [`supabase/schema.sql`](./supabase/schema.sql).
3. In the repository's **Settings → Secrets and variables → Actions**, add:
   - `VITE_SUPABASE_URL` — the project URL.
   - `VITE_SUPABASE_ANON_KEY` — the publishable/anon key (never a service-role key).
4. In **Settings → Pages**, set the source to **GitHub Actions**.
5. Run **Actions → Deploy attendance dashboard → Run workflow**.

The register intentionally allows anonymous reads and writes, so anyone with the public URL can view, add, edit, or delete attendance records. Do not store sensitive information in it.

For local development, copy `.env.example` to `.env.local` and enter the same Supabase project URL and publishable/anon key. Without these values, the app clearly indicates that data is saved only in the current browser.
