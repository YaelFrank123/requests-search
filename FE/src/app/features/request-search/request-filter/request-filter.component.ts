import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

import { RequestStatus, RequestType } from '../../../core/models/request.model';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';

const STATUS_OPTIONS: RequestStatus[] = ['New', 'InProgress', 'Completed', 'Cancelled'];
const REQUEST_TYPE_OPTIONS: RequestType[] = ['General', 'Legal', 'Payment', 'Appeal'];

export interface RequestFilterValue {
  requestNumber: string | null;
  status: RequestStatus[] | null;
  requestType: RequestType | null;
  createdFrom: Date | null;
  createdTo: Date | null;
}

/**
 * Owns the filter form and its own state. Emits the current filter values
 * whenever the user applies or clears — the container decides what to do
 * with them (query the API, reset the page, etc).
 */
@Component({
    selector: 'app-request-filter',
    imports: [
        ReactiveFormsModule,
        MatFormFieldModule,
        MatInputModule,
        MatSelectModule,
        MatDatepickerModule,
        MatButtonModule,
        TranslatePipe
    ],
    templateUrl: './request-filter.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush,
    styleUrl: './request-filter.component.scss'
})
export class RequestFilterComponent {
  private readonly fb = inject(FormBuilder);

  readonly statusOptions = STATUS_OPTIONS;
  readonly requestTypeOptions = REQUEST_TYPE_OPTIONS;

  readonly filterForm = this.fb.group({
    requestNumber: [''],
    status: [[] as RequestStatus[]],
    requestType: [null as RequestType | null],
    createdFrom: [null as Date | null],
    createdTo: [null as Date | null]
  });

  readonly filtersChanged = output<RequestFilterValue>();

  apply(): void {
    this.filtersChanged.emit(this.filterForm.getRawValue());
  }

  clear(): void {
    this.filterForm.reset({
      requestNumber: '',
      status: [],
      requestType: null,
      createdFrom: null,
      createdTo: null
    });
    this.apply();
  }
}
