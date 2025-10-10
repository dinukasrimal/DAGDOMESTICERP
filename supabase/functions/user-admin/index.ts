import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, PATCH, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
  throw new Error('Missing required environment variables for user-admin function');
}

const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const buildRequestClient = (accessToken: string) =>
  createClient(SUPABASE_URL, ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

async function ensureOwner(accessToken: string) {
  const requestClient = buildRequestClient(accessToken);
  const {
    data: { user },
    error: userError,
  } = await requestClient.auth.getUser();

  if (userError || !user) {
    throw new Response(JSON.stringify({ message: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data, error } = await adminClient.rpc('app_is_owner', {
    check_user_id: user.id,
  });

  if (error) {
    console.error('Owner check failed', error.message);
    throw new Response(JSON.stringify({ message: 'Unable to verify permissions' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!data) {
    throw new Response(JSON.stringify({ message: 'Forbidden' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return user;
}

async function handleCreateUser(request: Request, accessToken: string) {
  const owner = await ensureOwner(accessToken);
  const payload = await request.json();
  const { email, password, fullName, roleIds } = payload ?? {};

  if (!email || !password) {
    return new Response(JSON.stringify({ message: 'Email and password are required.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName ?? null,
    },
  });

  if (createError || !created?.user) {
    console.error('Create user failed', createError?.message);
    return new Response(JSON.stringify({ message: createError?.message ?? 'Failed to create user.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const newUser = created.user;

  const { error: upsertError } = await adminClient.from('app_users').upsert({
    user_id: newUser.id,
    full_name: fullName ?? null,
    is_active: true,
  });

  if (upsertError) {
    console.error('Failed to sync app_users', upsertError.message);
  }

  if (Array.isArray(roleIds) && roleIds.length > 0) {
    const rows = roleIds.map((roleId: string) => ({
      user_id: newUser.id,
      role_id: roleId,
      assigned_by: owner.id,
    }));
    const { error: roleError } = await adminClient.from('app_user_roles').insert(rows, { upsert: true });
    if (roleError) {
      console.error('Failed to assign roles', roleError.message);
    }
  }

  return new Response(JSON.stringify({ userId: newUser.id, email: newUser.email }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function handleUpdateUser(request: Request, accessToken: string) {
  await ensureOwner(accessToken);
  const payload = await request.json();
  const { userId, isActive, roleIds } = payload ?? {};

  if (!userId) {
    return new Response(JSON.stringify({ message: 'userId is required.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (typeof isActive === 'boolean') {
    const { error } = await adminClient.from('app_users').upsert({
      user_id: userId,
      is_active: isActive,
    });
    if (error) {
      console.error('Failed to update activity', error.message);
      return new Response(JSON.stringify({ message: 'Failed to update user state.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  if (Array.isArray(roleIds)) {
    const { error: deleteError } = await adminClient
      .from('app_user_roles')
      .delete()
      .eq('user_id', userId);
    if (deleteError) {
      console.error('Failed clearing roles', deleteError.message);
      return new Response(JSON.stringify({ message: 'Failed updating roles.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (roleIds.length > 0) {
      const rows = roleIds.map((roleId: string) => ({ user_id: userId, role_id: roleId }));
      const { error: insertError } = await adminClient.from('app_user_roles').insert(rows);
      if (insertError) {
        console.error('Failed inserting roles', insertError.message);
        return new Response(JSON.stringify({ message: 'Failed updating roles.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }
  }

  return new Response(JSON.stringify({ userId, updated: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ message: 'Missing authorization header.' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const token = authHeader.replace('Bearer ', '').trim();

  try {
    if (req.method === 'POST') {
      return await handleCreateUser(req, token);
    }
    if (req.method === 'PATCH') {
      return await handleUpdateUser(req, token);
    }
    return new Response(JSON.stringify({ message: 'Not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('Unhandled error', error);
    return new Response(JSON.stringify({ message: 'Unexpected error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
