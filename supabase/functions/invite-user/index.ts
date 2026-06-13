// Edge Function: invite-user
// Admin-only. Creates a user_invitations row and sends a Supabase invite email.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { email, is_admin, first_name, last_name, department_id, job_title, permissions, redirect_to } = await req.json()
    if (!email) return json({ error: 'email required' }, 400)

    const url = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    // Identify the caller from their JWT
    const authHeader = req.headers.get('Authorization') ?? ''
    const callerClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } })
    const { data: { user: caller } } = await callerClient.auth.getUser()
    if (!caller) return json({ error: 'unauthorized' }, 401)

    const admin = createClient(url, serviceKey)

    // Verify the caller is an admin and get their company
    const { data: callerProfile } = await admin
      .from('users')
      .select('company_id, is_admin')
      .eq('id', caller.id)
      .single()
    if (!callerProfile?.is_admin) return json({ error: 'forbidden' }, 403)

    // Record the invitation
    const token = crypto.randomUUID()
    const { error: invErr } = await admin.from('user_invitations').insert({
      company_id: callerProfile.company_id,
      email,
      token,
      invited_by: caller.id,
      is_admin: !!is_admin,
      first_name: first_name ?? null,
      last_name: last_name ?? null,
      department_id: department_id || null,
      job_title: job_title ?? null,
      permissions: is_admin ? null : (permissions ?? null),
      status: 'pending',
    })
    if (invErr) return json({ error: invErr.message }, 400)

    // Send the Supabase invite email (redirects to the accept-invite page)
    const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: redirect_to,
    })
    if (inviteErr) return json({ error: inviteErr.message }, 400)

    return json({ ok: true }, 200)
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
