import { HttpClient } from '@angular/common/http';
import { Inject, Injectable, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { API_BASE_URL } from '../config/api-base-url.token';
import { LoginResponse } from '../models/user.model';

const STORAGE_KEY = 'auth';

interface StoredSession {
  token: string;
  username: string;
  role: string;
  expiresAt: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly session = signal<StoredSession | null>(this.readSession());

  constructor(
    private readonly http: HttpClient,
    @Inject(API_BASE_URL) private readonly apiBaseUrl: string
  ) {}

  get token(): string | null {
    return this.session()?.token ?? null;
  }

  get username(): string | null {
    return this.session()?.username ?? null;
  }

  get role(): string | null {
    return this.session()?.role ?? null;
  }

  isAuthenticated(): boolean {
    const session = this.session();
    return !!session && new Date(session.expiresAt).getTime() > Date.now();
  }

  login(username: string, password: string): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(`${this.apiBaseUrl}/auth/login`, { username, password })
      .pipe(tap((response) => this.storeSession(response)));
  }

  logout(): void {
    sessionStorage.removeItem(STORAGE_KEY);
    this.session.set(null);
  }

  private storeSession(response: LoginResponse): void {
    // token/username/role/expiresAt are stored exactly as the server returned them —
    // never decoded from the JWT, which is not this client's job to parse.
    const session: StoredSession = {
      token: response.token,
      username: response.username,
      role: response.role,
      expiresAt: response.expiresAt
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    this.session.set(session);
  }

  private readSession(): StoredSession | null {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as StoredSession;
    } catch {
      return null;
    }
  }
}
