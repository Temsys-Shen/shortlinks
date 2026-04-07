export interface ShortLinkRecord {
  code: string;
  url: string;
  createdAt: string;
  updatedAt: string;
}

export interface ShortLinkListResponse {
  items: ShortLinkRecord[];
  cursor: string;
  list_complete: boolean;
}
