import { HttpBackend, HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

interface SiteConfig {
  apiBaseUrl: string;
}

@Injectable({ providedIn: 'root' })
export class AppConfigService {
  // HttpBackend bypasses all HTTP interceptors — this request must not carry
  // an Authorization header, and loading it must not depend on auth state.
  private readonly http = new HttpClient(inject(HttpBackend));
  private config?: SiteConfig;

  async load(): Promise<void> {
    this.config = await firstValueFrom(this.http.get<SiteConfig>('/assets/config/site.config.json'));
  }

  get apiBaseUrl(): string {
    if (!this.config) {
      throw new Error('AppConfigService.load() has not completed yet.');
    }
    return this.config.apiBaseUrl;
  }
}
