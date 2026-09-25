// Memory cache for profiles to reduce Supabase hits
const profileCache = new Map<string, { data: RequesterProfile; expires: number }>();
const CACHE_TTL = 30 * 1000; // 30 seconds cache for profile data

export type RequesterProfile = {
  id: string;
  role: string | null;
  company_id: string | null;
};

export async function requireRequesterProfile(client: any, userId: string | null): Promise<RequesterProfile> {
  if (!userId) {
    const err = new Error("AUTH_INVALID");
    (err as any).status = 401;
    (err as any).code = "AUTH_INVALID";
    throw err;
  }

  // Check cache first
  const now = Date.now();
  const cached = profileCache.get(userId);
  if (cached && cached.expires > now) {
    return cached.data;
  }

  const supaRes = await client
    .from("profiles")
    .select("id, role, company_id")
    .eq("id", userId)
    .single();

  const { data, error } = supaRes;

  if (error || !data) {
    const err = new Error(error?.message || "PROFILE_NOT_FOUND");
    (err as any).status = (error as any)?.status || 403;
    (err as any).code = (error as any)?.code || "PROFILE_NOT_FOUND";
    throw err;
  }

  // Save to cache
  profileCache.set(userId, { data, expires: now + CACHE_TTL });

  return data;
}

export function isAdminRole(role?: string | null): boolean {
  const r = (role || "").toUpperCase();
  return r === "ADMIN";
}
