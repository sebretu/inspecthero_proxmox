import { useState, useEffect } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { authSupabase } from './authClient';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://inspecthero.pl';

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUserRole = async (userId: string, token?: string) => {
    try {
      if (token) {
        const res = await fetch(`${API_BASE_URL}/api/me`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (res.ok) {
          const json = await res.json();
          const prof = json?.data?.profile || json?.profile;
          if (prof?.role) {
            setRole(prof.role);
            return;
          }
        }
      }

      // Fallback to direct supabase query
      const { data } = await authSupabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single();
      setRole(data?.role || 'WORKER');
    } catch {
      setRole('WORKER');
    }
  };

  useEffect(() => {
    // 1. Check existing stored session
    authSupabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user?.id) {
        fetchUserRole(session.user.id, session.access_token);
      } else {
        setRole(null);
      }
      setLoading(false);
    });

    // 2. Listen for auth changes
    const { data: { subscription } } = authSupabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user?.id) {
          fetchUserRole(session.user.id, session.access_token);
        } else {
          setRole(null);
        }
        setLoading(false);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await authSupabase.auth.signOut();
    setSession(null);
    setUser(null);
    setRole(null);
  };

  const normalizedRole = (role || '').toUpperCase();
  const isAdmin = normalizedRole === 'ADMIN';
  const isJozef = user?.email === 'jozef@demo.pl' || user?.email === 'jozesf@demo.pl';
  const isMod = isAdmin || normalizedRole === 'MODERATOR' || normalizedRole === 'MOD' || isJozef;

  return { session, user, role, isAdmin, isMod, loading, isAuthenticated: !!session, signOut };
}

