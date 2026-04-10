import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const users = [
    "badc8b15-485a-425c-b23b-c8950c23951c",
    "b2e725d4-2146-45b5-b217-69d85a8947c0",
    "5c9452fc-ca49-416d-82ce-2b6050e79096",
  ];

  const results = [];
  for (const id of users) {
    const { error } = await supabase.auth.admin.updateUserById(id, {
      password: "mnaa1!!",
    });
    results.push({ id, error: error?.message ?? null });
  }

  return new Response(JSON.stringify(results), {
    headers: { "Content-Type": "application/json" },
  });
});
