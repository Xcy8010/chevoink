const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim()

export const apiBaseUrl = configuredApiBaseUrl ? configuredApiBaseUrl.replace(/\/$/, '') : ''

export function buildApiUrl(path: string): string {
  return `${apiBaseUrl}${path}`
}
