// Cliente HTTP del API versionada /api/v1 (Fase B/C).
const BASE = import.meta.env.VITE_API_URL ?? '';
export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}/api/v1${path}`, { credentials: 'include' });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json() as Promise<T>;
}
