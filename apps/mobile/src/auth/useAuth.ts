import { useState, useEffect } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { authSupabase } from './authClient';

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUserRole = async (userId: string) => {
    try {
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
        fetchUserRole(session.user.id);
      }
      setLoading(false);
    });

    // 2. Listen for auth changes
    const { data: { subscription } } = authSupabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user?.id) {
          fetchUserRole(session.user.id);
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

  const isAdmin = role === 'ADMIN' || role === 'MODERATOR' || role === 'MOD';

  return { session, user, role, isAdmin, loading, isAuthenticated: !!session, signOut };
}
