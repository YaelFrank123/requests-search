import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, inject, provideAppInitializer, provideZoneChangeDetection } from '@angular/core';
import { provideNativeDateAdapter } from '@angular/material/core';
import { provideRouter } from '@angular/router';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';
import { firstValueFrom } from 'rxjs';

import { routes } from './app.routes';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { API_BASE_URL } from './core/config/api-base-url.token';
import { AppConfigService } from './core/config/app-config.service';
import { authInterceptor } from './core/interceptors/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideAnimationsAsync(),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideNativeDateAdapter(),
    provideTranslateService({
      fallbackLang: 'en',
      // Loads via HttpBackend, bypassing all HTTP interceptors — this request
      // must not carry an Authorization header, and loading it must not
      // depend on auth state.
      loader: provideTranslateHttpLoader({ prefix: '/assets/i18n/', suffix: '.json', useHttpBackend: true })
    }),
    // The application does not render until site.config.json has loaded.
    provideAppInitializer(() => inject(AppConfigService).load()),
    provideAppInitializer(() => firstValueFrom(inject(TranslateService).use('en'))),
    { provide: API_BASE_URL, useFactory: () => inject(AppConfigService).apiBaseUrl }
  ]
};
