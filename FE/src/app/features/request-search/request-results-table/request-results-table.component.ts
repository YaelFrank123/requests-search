import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';

import { RequestDto } from '../../../core/models/request.model';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * Presentational only: renders whatever it is given and forwards raw
 * MatSort / MatPaginator events unmodified. All interpretation — what a
 * cleared sort means, page-index vs page-number — is the stateful page's job.
 * Loading/error states live in the container; this component only ever
 * sees rows it should render (including the empty-rows case).
 */
@Component({
    selector: 'app-request-results-table',
    imports: [MatTableModule, MatSortModule, MatPaginatorModule, TranslatePipe],
    templateUrl: './request-results-table.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush,
    styleUrl: './request-results-table.component.scss'
})
export class RequestResultsTableComponent {
  readonly rows = input<RequestDto[]>([]);
  readonly totalCount = input(0);
  readonly page = input(1);
  readonly pageSize = input(25);
  readonly sortActive = input('');
  readonly sortDirection = input<'asc' | 'desc' | ''>('');

  readonly sortChange = output<Sort>();
  readonly pageChange = output<PageEvent>();

  readonly displayedColumns = [
    'requestNumber',
    'status',
    'requestType',
    'createdAt',
    'customerId',
    'ownerId',
    'assignedToUserId'
  ];

  readonly pageSizeOptions = [10, 25, 50, 100];
}
