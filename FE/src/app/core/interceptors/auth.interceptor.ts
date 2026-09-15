import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';

import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);

  // A stale token on the login request itself would be a bug signal, not a
  // convenience — the endpoint is [AllowAnonymous] and expects none.
  const isLoginRequest = req.url.endsWith('/auth/login');
  const token = authService.token();

  const authorizedReq =
    !isLoginRequest && token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(authorizedReq).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        authService.logout();
      }
      return throwError(() => error);
    })
  );
};
