export type RequestStatus = 'New' | 'InProgress' | 'Completed' | 'Cancelled';

export type RequestType = 'General' | 'Legal' | 'Payment' | 'Appeal';

export interface RequestDto {
  id: number;
  requestNumber: string;
  customerId: number;
  ownerId: number;
  assignedToUserId: number | null;
  status: RequestStatus;
  requestType: RequestType;
  createdAt: string;
}
