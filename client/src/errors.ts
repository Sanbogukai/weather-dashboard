// The error every failed API call throws. Kept apart from api.ts, which touches localStorage as
// it loads, so code that only checks errors (and its tests) can import this without a browser.

// The shape of field issues the server sends on a 400.
import type { Issue } from '../../shared/types.ts'

// The code used when the answer carries none: no server answered, or something in between
// (Vite's proxy, Render's edge) sent its own page.
export const UNREACHABLE = 'unreachable'

// An Error that also carries the HTTP status, the server's error code and any field issues.
export class ApiError extends Error {
  // The response status, or 0 when the request never got an answer.
  status: number
  // The server's code, such as "duplicate" or "upstream_timeout".
  code: string
  // Empty unless the server named the fields at fault.
  issues: Issue[]

  constructor(message: string, status: number, code: string, issues: Issue[] = []) {
    // Error keeps the message.
    super(message)
    // Shown in the console instead of plain "Error".
    this.name = 'ApiError'
    // The three extra fields.
    this.status = status
    this.code = code
    this.issues = issues
  }
}
