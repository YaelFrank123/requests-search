import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { Sort } from '@angular/material/sort';
import { EMPTY, Subject, catchError, debounceTime, distinctUntilChanged, startWith, switchMap, takeUntil, tap } from 'rxjs';

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
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrl: './request-search-page.component.scss'
})
export class RequestSearchPageComponent implements OnInit, OnDestroy {
  protected readonly authService = inject(AuthService);
  private readonly api = inject(RequestsApiService);
  private readonly fb = inject(FormBuilder);
  private readonly destroy$ = new Subject<void>();
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

  private currentSort: { sortBy?: RequestSortField; sortDirection?: SortDirection } = {};
  private currentPage = 1;
  private currentPageSize = 25;

  rows: RequestDto[] = [];
  totalCount = 0;
  loading = false;
  errorMessage: string | null = null;

  get page(): number {
    return this.currentPage;
  }

  get pageSize(): number {
    return this.currentPageSize;
  }

  get sortActive(): string {
    return this.currentSort.sortBy ?? '';
  }

  get sortDirection(): 'asc' | 'desc' | '' {
    return this.currentSort.sortDirection ?? '';
  }

  ngOnInit(): void {
    // A filter change always returns to page 1 — landing on page 40 of a
    // three-row result would just show the empty state for the wrong reason.
    this.filterForm.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
        tap(() => (this.currentPage = 1)),
        takeUntil(this.destroy$)
      )
      .subscribe(() => this.search$.next());

    this.search$
      .pipe(
        startWith(undefined),
        tap(() => {
          this.loading = true;
          this.errorMessage = null;
        }),
        switchMap(() =>
          this.api.search(this.buildQuery()).pipe(
            catchError((error: unknown) => {
              this.loading = false;
              this.errorMessage =
                error instanceof HttpErrorResponse && error.status === 400 && error.error?.errors
                  ? Object.values(error.error.errors as Record<string, string[]>).flat().join(' ')
                  : 'Something went wrong loading requests.';
              return EMPTY;
            })
          )
        ),
        takeUntil(this.destroy$)
      )
      .subscribe((result) => {
        this.loading = false;
        this.rows = result.items;
        this.totalCount = result.totalCount;
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onSortChange(sort: Sort): void {
    // A cleared third click emits direction: '' — sending sortDirection= is a 400.
    // Omit both fields instead, which is what "no sort requested" actually means.
    this.currentSort = sort.direction
      ? { sortBy: sort.active as RequestSortField, sortDirection: sort.direction as SortDirection }
      : {};
    this.search$.next();
  }

  onPageChange(event: PageEvent): void {
    this.currentPage = event.pageIndex + 1;
    this.currentPageSize = event.pageSize;
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
  }

  logout(): void {
    this.authService.logout();
  }

  private buildQuery(): RequestSearchQuery {
    const raw = this.filterForm.getRawValue();
    return {
      requestNumber: raw.requestNumber?.trim() || undefined,
      status: raw.status && raw.status.length > 0 ? raw.status : undefined,
      requestType: raw.requestType ?? undefined,
      createdFrom: raw.createdFrom ? toLocalDateString(raw.createdFrom) : undefined,
      createdTo: raw.createdTo ? toLocalDateString(raw.createdTo) : undefined,
      sortBy: this.currentSort.sortBy,
      sortDirection: this.currentSort.sortDirection,
      page: this.currentPage,
      pageSize: this.currentPageSize
    };
  }
}
