import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { Router } from '@angular/router';

import { AuthService } from '../../../core/services/auth.service';

/**
 * Placeholder destination for the guarded route, built out fully in T10.
 * Exists now only so T9a's login/guard/logout flow has somewhere real to land.
 */
@Component({
  selector: 'app-request-search-page',
  standalone: true,
  imports: [MatButtonModule],
  template: `
    <p>Logged in as {{ authService.username }} ({{ authService.role }})</p>
    <button mat-button (click)="logout()">Logout</button>
    <p>Request search — built in T10.</p>
  `
})
export class RequestSearchPageComponent {
  protected readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  logout(): void {
    this.authService.logout();
    this.router.navigateByUrl('/login');
  }
}
