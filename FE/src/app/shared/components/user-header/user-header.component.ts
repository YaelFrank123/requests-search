import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';

import { AuthService } from '../../../core/services/auth.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';

@Component({
    selector: 'app-user-header',
    imports: [MatButtonModule, TranslatePipe],
    templateUrl: './user-header.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush,
    styleUrl: './user-header.component.scss'
})
export class UserHeaderComponent {
  protected readonly authService = inject(AuthService);

  logout(): void {
    this.authService.logout();
  }
}
