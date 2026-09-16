import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PageEvent } from '@angular/material/paginator';
import { Sort } from '@angular/material/sort';
import { EMPTY, Subject, catchError, startWith, switchMap, tap } from 'rxjs';

import { RequestsApiService } from '../../../core/services/requests-api.service';
import { RequestDto } from '../../../core/models/request.model';
import { RequestSearchQuery, RequestSortField, SortDirection } from '../../../core/models/search-query.model';
import { RequestResultsTableComponent } from '../request-results-table/request-results-table.component';
import { RequestFilterComponent, RequestFilterValue } from '../request-filter/request-filter.component';
import { LoadingIndicatorComponent } from '../../../shared/components/loading-indicator/loading-indicator.component';
import { UserHeaderComponent } from '../../user-header/user-header.component';
import { TranslatePipe } from '@ngx-translate/core';
import { toLocalDateString } from '../../../shared/utils/date.util';

const EMPTY_FILTERS: RequestFilterValue = {
  requestNumber: '',
  status: [],
  requestType: null,
  createdFrom: null,
  createdTo: null
};

@Component({
    selector: 'app-request-search-page',
    imports: [
        RequestFilterComponent,
        RequestResultsTableComponent,
        LoadingIndicatorComponent,
        UserHeaderComponent,
        TranslatePipe
    ],
    templateUrl: './request-search-page.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush,
    styleUrl: './request-search-page.component.scss'
})
export class RequestSearchPageComponent implements OnInit {
  private readonly api = inject(RequestsApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly search$ = new Subject<void>();

  private readonly currentFilters = signal<RequestFilterValue>(EMPTY_FILTERS);
  private readonly currentSort = signal<{ sortBy?: RequestSortField; sortDirection?: SortDirection }>({});
  private readonly currentPage = signal(1);
  private readonly currentPageSize = signal(25);

  readonly rows = signal<RequestDto[]>([]);
  readonly totalCount = signal(0);
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly page = computed(() => this.currentPage());
  readonly pageSize = computed(() => this.currentPageSize());
  readonly sortActive = computed(() => this.currentSort().sortBy ?? '');
  readonly sortDirection = computed(() => this.currentSort().sortDirection ?? '');

  ngOnInit(): void {
    this.search$
      .pipe(
        startWith(undefined),
        tap(() => {
          this.loading.set(true);
          this.errorMessage.set(null);
        }),
        switchMap(() =>
          this.api.search(this.buildQuery()).pipe(
            catchError((error: unknown) => {
              this.loading.set(false);
              this.errorMessage.set(
                error instanceof HttpErrorResponse && error.status === 400 && error.error?.errors
                  ? Object.values(error.error.errors as Record<string, string[]>).flat().join(' ')
                  : 'Something went wrong loading requests.'
              );
              return EMPTY;
            })
          )
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((result) => {
        this.loading.set(false);
        this.rows.set(result.items);
        this.totalCount.set(result.totalCount);
      });
  }

  onFiltersChanged(filters: RequestFilterValue): void {
    this.currentFilters.set(filters);
    this.currentPage.set(1);
    this.search$.next();
  }

  onSortChange(sort: Sort): void {
    // A cleared third click emits direction: '' — sending sortDirection= is a 400.
    // Omit both fields instead, which is what "no sort requested" actually means.
    this.currentSort.set(
      sort.direction ? { sortBy: sort.active as RequestSortField, sortDirection: sort.direction as SortDirection } : {}
    );
    this.search$.next();
  }

  onPageChange(event: PageEvent): void {
    this.currentPage.set(event.pageIndex + 1);
    this.currentPageSize.set(event.pageSize);
    this.search$.next();
  }

  private buildQuery(): RequestSearchQuery {
    const filters = this.currentFilters();
    const sort = this.currentSort();
    return {
      requestNumber: filters.requestNumber?.trim() || undefined,
      status: filters.status && filters.status.length > 0 ? filters.status : undefined,
      requestType: filters.requestType ?? undefined,
      createdFrom: filters.createdFrom ? toLocalDateString(filters.createdFrom) : undefined,
      createdTo: filters.createdTo ? toLocalDateString(filters.createdTo) : undefined,
      sortBy: sort.sortBy,
      sortDirection: sort.sortDirection,
      page: this.currentPage(),
      pageSize: this.currentPageSize()
    };
  }
}
