import { RequestStatus, RequestType } from './request.model';

export type RequestSortField = 'requestNumber' | 'status' | 'requestType' | 'createdAt';

export type SortDirection = 'asc' | 'desc';

export interface RequestSearchQuery {
  requestNumber?: string;
  status?: RequestStatus[];
  requestType?: RequestType;
  createdFrom?: string;
  createdTo?: string;
  sortBy?: RequestSortField;
  sortDirection?: SortDirection;
  page: number;
  pageSize: number;
}
