import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Generic error message display. Carries no business meaning of its own,
 * so it lives outside any feature folder. The caller decides when to mount it.
 */
@Component({
    selector: 'app-error-message',
    imports: [],
    templateUrl: './error-message.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush,
    styleUrl: './error-message.component.scss'
})
export class ErrorMessageComponent {
  readonly errorMessage = input.required<string>();
}
