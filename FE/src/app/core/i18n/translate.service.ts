import { HttpBackend, HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

type TranslationTree = { [key: string]: string | TranslationTree };

@Injectable({ providedIn: 'root' })
export class TranslateService {
  // HttpBackend bypasses all HTTP interceptors — this request must not carry
  // an Authorization header, and loading it must not depend on auth state.
  private readonly http = new HttpClient(inject(HttpBackend));
  private translations: TranslationTree = {};

  async load(): Promise<void> {
    this.translations = await firstValueFrom(this.http.get<TranslationTree>('/assets/i18n/en.json'));
  }

  instant(key: string, params?: Record<string, string | null | undefined>): string {
    const value = key.split('.').reduce<string | TranslationTree | undefined>(
      (node, segment) => (node && typeof node === 'object' ? node[segment] : undefined),
      this.translations
    );

    if (typeof value !== 'string') {
      return key;
    }

    if (!params) {
      return value;
    }

    return Object.entries(params).reduce(
      (result, [paramKey, paramValue]) => result.replaceAll(`{{${paramKey}}}`, paramValue ?? ''),
      value
    );
  }
}
