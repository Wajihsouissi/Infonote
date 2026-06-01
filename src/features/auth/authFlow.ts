import type { Session, User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../../services/supabase/client';

export const EMAIL_IN_USE_MESSAGE = 'This email is already in use.';

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
        return 'Your email address has not been confirmed yet. Please check your inbox and confirm your email before signing in.';
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
