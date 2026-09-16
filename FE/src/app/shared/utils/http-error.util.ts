import { HttpErrorResponse } from '@angular/common/http';

export function extractHttpErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof HttpErrorResponse)) {
    return fallback;
  }

  const body = error.error;

  if (typeof body?.title === 'string') {
    return body.title;
  }

  if (body?.errors) {
    return Object.values(body.errors as Record<string, string[]>).flat().join(' ');
  }

  return fallback;
}
