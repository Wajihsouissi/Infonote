import type { Session, User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../../services/supabase/client';
import { useStore } from '../../store/useStore';

export const EMAIL_IN_USE_MESSAGE = 'This email is already in use.';
export const EMAIL_CONFIRMATION_ENABLED_MESSAGE =
    'Account created, but Supabase did not start a session. Turn OFF Authentication -> Providers -> Email -> Confirm email in Supabase, then try again.';

type SignUpResult = {
    user: (User & { identities?: unknown[] | null }) | null;
    session: Session | null;
};

export function getFriendlyAuthError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    const lower = message.toLowerCase();

    if (lower.includes('already') || lower.includes('registered')) {
        return EMAIL_IN_USE_MESSAGE;
    }
    if (lower.includes('if you just created')) {
        return message;
    }
    if (lower.includes('confirm') || lower.includes('not confirmed')) {
        return EMAIL_CONFIRMATION_ENABLED_MESSAGE;
    }
    if (lower.includes('invalid') || lower.includes('credentials')) {
        return 'Invalid email or password.';
    }
    return message;
}

export function isDuplicateSignupResponse(data: SignUpResult | null): boolean {
    const identities = data?.user?.identities;
    return Boolean(data?.user && Array.isArray(identities) && identities.length === 0);
}

export async function isEmailRegistered(email: string): Promise<boolean> {
    if (!isSupabaseConfigured || !supabase) return false;
    try {
        const { data, error } = await supabase.rpc('email_is_registered', {
            _email: email.trim().toLowerCase(),
        });
        if (error) {
            console.warn('[auth] email_is_registered RPC failed:', error.message);
            return false;
        }
        return data === true;
    } catch (err) {
        console.warn('[auth] email_is_registered check failed:', err);
        return false;
    }
}

export async function getActiveSession(): Promise<Session | null> {
    if (!isSupabaseConfigured || !supabase) return null;
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session ?? null;
}

export async function ensureUserProfile(user: User): Promise<void> {
    if (!isSupabaseConfigured || !supabase) return;

    const displayName =
        (user.user_metadata?.display_name as string | undefined) ||
        (user.user_metadata?.full_name as string | undefined) ||
        (user.user_metadata?.name as string | undefined) ||
        user.email?.split('@')[0] ||
        'User';

    const { error } = await supabase
        .from('user_profiles')
        .upsert(
            {
                id: user.id,
                email: user.email || '',
                display_name: displayName,
                account_status: 'active',
            },
            { onConflict: 'id' }
        );

    if (error) throw error;
}

export async function ensureUserWorkspace(userId: string): Promise<string | null> {
    if (!isSupabaseConfigured || !supabase) return null;

    const legacyStorageKey = 'chnk it.activeWorkspaceId';
    const userStorageKey = `chnk-it.activeWorkspaceId.${userId}`;
    const cached = localStorage.getItem(userStorageKey) || localStorage.getItem(legacyStorageKey);

    if (cached) {
        const { data: cachedWorkspace, error } = await supabase
            .from('workspaces')
            .select('id')
            .eq('id', cached)
            .eq('owner_id', userId)
            .maybeSingle();

        if (!error && cachedWorkspace?.id) {
            localStorage.setItem(userStorageKey, cachedWorkspace.id);
            localStorage.setItem(legacyStorageKey, cachedWorkspace.id);
            return cachedWorkspace.id;
        }

        localStorage.removeItem(userStorageKey);
        localStorage.removeItem(legacyStorageKey);
    }

    const { data: existing, error: readError } = await supabase
        .from('workspaces')
        .select('id')
        .eq('owner_id', userId)
        .order('created_at', { ascending: true })
        .limit(1);

    if (readError) throw readError;

    const existingId = existing?.[0]?.id;
    if (existingId) {
        localStorage.setItem(userStorageKey, existingId);
        localStorage.setItem(legacyStorageKey, existingId);
        return existingId;
    }

    const { data: created, error: createError } = await supabase
        .from('workspaces')
        .insert({ owner_id: userId, name: 'My Workspace' })
        .select('id')
        .single();

    if (createError) throw createError;

    if (created?.id) {
        localStorage.setItem(userStorageKey, created.id);
        localStorage.setItem(legacyStorageKey, created.id);
        return created.id;
    }

    return null;
}

export async function activateAuthenticatedSession(session: Session): Promise<void> {
    const user = session.user;
    const displayName =
        (user.user_metadata?.display_name as string | undefined) ||
        (user.user_metadata?.full_name as string | undefined) ||
        (user.user_metadata?.name as string | undefined) ||
        null;

    const { setAuthLoading, setAuthUser, setAuthWorkspace } = useStore.getState();
    setAuthLoading(true);
    setAuthUser({
        id: user.id,
        email: user.email ?? null,
        displayName,
    });

    try {
        await ensureUserProfile(user);
    } catch (err) {
        console.warn('[auth] Failed to upsert user profile after sign-in:', err);
    }

    try {
        const workspaceId = await ensureUserWorkspace(user.id);
        setAuthWorkspace(workspaceId);
    } catch (err) {
        console.warn('[auth] Failed to provision user workspace after sign-in:', err);
        setAuthWorkspace(null);
    } finally {
        setAuthLoading(false);
    }
}
