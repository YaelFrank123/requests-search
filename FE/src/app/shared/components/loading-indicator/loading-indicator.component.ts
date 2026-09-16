import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatProgressBarModule } from '@angular/material/progress-bar';

/**
 * Generic loading indicator. Carries no business meaning of its own, so it
 * lives outside any feature folder. The caller decides when to mount it.
 */
@Component({
    selector: 'app-loading-indicator',
    imports: [MatProgressBarModule],
    templateUrl: './loading-indicator.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush,
    styleUrl: './loading-indicator.component.scss'
})
export class LoadingIndicatorComponent {}
