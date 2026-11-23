// The error type the routes throw when a request cannot be answered. The app's error handler
// turns it into the one error shape the API sends: { error: { code, message, issues? } }.

// The per-field problem type, shared with the client.
import type { Issue } from '../../shared/types.ts';

// An expected failure with an HTTP status, a stable code the client can switch on, and a
// message for people. Anything thrown that is not one of these becomes a plain 500.
export class ApiFailure extends Error {
  // The HTTP status to answer with, such as 400 or 502.
  readonly status: number;
  // A short, stable name for the failure, such as "upstream_timeout".
  readonly code: string;
  // For bad input: what was wrong with each field.
  readonly issues: Issue[] | undefined;

  constructor(status: number, code: string, message: string, issues?: Issue[]) {
    // Error keeps the message and the stack trace.
    super(message);
    // Shows "ApiFailure" rather than "Error" in logs.
    this.name = 'ApiFailure';
    this.status = status;
    this.code = code;
    this.issues = issues;
  }
}
