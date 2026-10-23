/**
 * The frontend is served by Firebase Hosting while the Express API stays on
 * Vercel, so production builds set VITE_API_BASE_URL to the Vercel origin.
 * Left empty (dev server, emulator), calls stay same-origin.
 */
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}
