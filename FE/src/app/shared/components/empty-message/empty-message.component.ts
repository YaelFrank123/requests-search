import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Generic "nothing to show" message. Carries no business meaning of its own,
 * so it lives outside any feature folder. The caller decides when to mount
 * it and supplies the message text.
 */
@Component({
    selector: 'app-empty-message',
    imports: [],
    templateUrl: './empty-message.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush,
    styleUrl: './empty-message.component.scss'
})
export class EmptyMessageComponent {
  readonly message = input.required<string>();
}
