-- User management schema for role-based permissions and component toggles

CREATE TABLE IF NOT EXISTS app_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_role_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id UUID NOT NULL REFERENCES app_roles(id) ON DELETE CASCADE,
    component_key TEXT NOT NULL,
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(role_id, component_key)
);

CREATE TABLE IF NOT EXISTS app_users (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_user_roles (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES app_roles(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES auth.users(id),
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS app_component_overrides (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    component_key TEXT NOT NULL,
    is_enabled BOOLEAN NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, component_key)
);

CREATE OR REPLACE FUNCTION app_is_owner(check_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM app_user_roles ur
        JOIN app_roles r ON r.id = ur.role_id
        WHERE ur.user_id = check_user_id
          AND r.name = 'owner'
    );
$$;

CREATE OR REPLACE FUNCTION app_active_user(check_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE((SELECT is_active FROM app_users WHERE user_id = check_user_id), TRUE);
$$;

CREATE OR REPLACE FUNCTION app_list_users()
RETURNS TABLE(user_id UUID, email TEXT, full_name TEXT, is_active BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    requester UUID;
BEGIN
    requester := NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID;
    IF requester IS NULL OR NOT app_is_owner(requester) THEN
        RAISE EXCEPTION USING MESSAGE = 'forbidden';
    END IF;

    RETURN QUERY
    SELECT u.id,
           u.email,
           au.full_name,
           au.is_active
    FROM auth.users AS u
    LEFT JOIN app_users AS au ON au.user_id = u.id
    ORDER BY u.email;
END;
$$;

CREATE TRIGGER trigger_app_roles_updated_at
    BEFORE UPDATE ON app_roles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_app_role_permissions_updated_at
    BEFORE UPDATE ON app_role_permissions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_app_users_updated_at
    BEFORE UPDATE ON app_users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_app_component_overrides_updated_at
    BEFORE UPDATE ON app_component_overrides
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

INSERT INTO app_roles (name, description, is_system)
VALUES
    ('owner', 'Full access to manage the workspace and users', TRUE),
    ('manager', 'Manage operational modules with limited administrative tools', TRUE)
ON CONFLICT (name) DO NOTHING;

ALTER TABLE app_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_component_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read for authenticated" ON app_roles
    FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "Manage roles for owners" ON app_roles
    USING (app_is_owner(auth.uid()))
    WITH CHECK (app_is_owner(auth.uid()));

CREATE POLICY "Enable read for authenticated" ON app_role_permissions
    FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "Manage role permissions for owners" ON app_role_permissions
    USING (app_is_owner(auth.uid()))
    WITH CHECK (app_is_owner(auth.uid()));

CREATE POLICY "Enable read for authenticated" ON app_users
    FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "Users update own profile" ON app_users
    FOR UPDATE TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owners manage users" ON app_users
    USING (app_is_owner(auth.uid()))
    WITH CHECK (app_is_owner(auth.uid()));

CREATE POLICY "Enable read for authenticated" ON app_user_roles
    FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "Owners manage user roles" ON app_user_roles
    USING (app_is_owner(auth.uid()))
    WITH CHECK (app_is_owner(auth.uid()));

CREATE POLICY "Enable read for authenticated" ON app_component_overrides
    FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "Users manage their overrides" ON app_component_overrides
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owners manage overrides" ON app_component_overrides
    USING (app_is_owner(auth.uid()))
    WITH CHECK (app_is_owner(auth.uid()));
