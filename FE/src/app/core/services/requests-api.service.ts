import { HttpClient, HttpParams } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { API_BASE_URL } from '../config/api-base-url.token';
import { PagedResult } from '../models/paged-result.model';
import { RequestDto } from '../models/request.model';
import { RequestSearchQuery } from '../models/search-query.model';

@Injectable({ providedIn: 'root' })
export class RequestsApiService {
  constructor(
    private readonly http: HttpClient,
    @Inject(API_BASE_URL) private readonly apiBaseUrl: string
  ) {}

  search(query: RequestSearchQuery): Observable<PagedResult<RequestDto>> {
    let params = new HttpParams().set('page', query.page).set('pageSize', query.pageSize);

    if (query.requestNumber) {
      params = params.set('requestNumber', query.requestNumber);
    }
    // Repeated params need append — set() keeps only the last value and
    // would silently filter by a single status instead of the selected set.
    for (const status of query.status ?? []) {
      params = params.append('status', status);
    }
    if (query.requestType) {
      params = params.set('requestType', query.requestType);
    }
    if (query.createdFrom) {
      params = params.set('createdFrom', query.createdFrom);
    }
    if (query.createdTo) {
      params = params.set('createdTo', query.createdTo);
    }
    if (query.sortBy && query.sortDirection) {
      params = params.set('sortBy', query.sortBy).set('sortDirection', query.sortDirection);
    }

    return this.http.get<PagedResult<RequestDto>>(`${this.apiBaseUrl}/requests`, { params });
  }
}
