import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';

import { RequestDto } from '../../../core/models/request.model';

/**
 * Presentational only: renders whatever it is given and forwards raw
 * MatSort / MatPaginator events unmodified. All interpretation — what a
 * cleared sort means, page-index vs page-number — is the stateful page's job.
 */
@Component({
  selector: 'app-request-results-table',
  standalone: true,
  imports: [MatTableModule, MatSortModule, MatPaginatorModule, MatProgressBarModule],
  templateUrl: './request-results-table.component.html',
  styleUrl: './request-results-table.component.scss'
})
export class RequestResultsTableComponent {
  @Input() rows: RequestDto[] = [];
  @Input() totalCount = 0;
  @Input() page = 1;
  @Input() pageSize = 25;
  @Input() sortActive = '';
  @Input() sortDirection: 'asc' | 'desc' | '' = '';
  @Input() loading = false;
  @Input() errorMessage: string | null = null;

  @Output() readonly sortChange = new EventEmitter<Sort>();
  @Output() readonly pageChange = new EventEmitter<PageEvent>();

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
