import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { Sort } from '@angular/material/sort';
import { EMPTY, Subject, catchError, startWith, switchMap, tap } from 'rxjs';

import { AuthService } from '../../../core/services/auth.service';
import { RequestsApiService } from '../../../core/services/requests-api.service';
import { RequestDto, RequestStatus, RequestType } from '../../../core/models/request.model';
import { RequestSearchQuery, RequestSortField, SortDirection } from '../../../core/models/search-query.model';
import { RequestResultsTableComponent } from '../request-results-table/request-results-table.component';

const STATUS_OPTIONS: RequestStatus[] = ['New', 'InProgress', 'Completed', 'Cancelled'];
const REQUEST_TYPE_OPTIONS: RequestType[] = ['General', 'Legal', 'Payment', 'Appeal'];

function toLocalDateString(date: Date): string {
  // Local yyyy-MM-dd, never toISOString().slice(0,10) — that shifts the day at UTC+ offsets.
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

@Component({
    selector: 'app-request-search-page',
    imports: [
        ReactiveFormsModule,
        MatFormFieldModule,
        MatInputModule,
        MatSelectModule,
        MatDatepickerModule,
        MatButtonModule,
        RequestResultsTableComponent
    ],
    templateUrl: './request-search-page.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush,
    styleUrl: './request-search-page.component.scss'
})
export class RequestSearchPageComponent implements OnInit {
  protected readonly authService = inject(AuthService);
  private readonly api = inject(RequestsApiService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly search$ = new Subject<void>();

  readonly statusOptions = STATUS_OPTIONS;
  readonly requestTypeOptions = REQUEST_TYPE_OPTIONS;

  readonly filterForm = this.fb.group({
    requestNumber: [''],
    status: [[] as RequestStatus[]],
    requestType: [null as RequestType | null],
    createdFrom: [null as Date | null],
    createdTo: [null as Date | null]
  });

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

  applyFilters(): void {
    this.currentPage.set(1);
    this.search$.next();
  }

  clearFilters(): void {
    this.filterForm.reset({
      requestNumber: '',
      status: [],
      requestType: null,
      createdFrom: null,
      createdTo: null
    });
    this.applyFilters();
  }

  logout(): void {
    this.authService.logout();
  }

  private buildQuery(): RequestSearchQuery {
    const raw = this.filterForm.getRawValue();
    const sort = this.currentSort();
    return {
      requestNumber: raw.requestNumber?.trim() || undefined,
      status: raw.status && raw.status.length > 0 ? raw.status : undefined,
      requestType: raw.requestType ?? undefined,
      createdFrom: raw.createdFrom ? toLocalDateString(raw.createdFrom) : undefined,
      createdTo: raw.createdTo ? toLocalDateString(raw.createdTo) : undefined,
      sortBy: sort.sortBy,
      sortDirection: sort.sortDirection,
      page: this.currentPage(),
      pageSize: this.currentPageSize()
    };
  }
}
