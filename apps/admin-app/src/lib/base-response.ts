/**
 * Client-side mirror of the backend's response envelope.
 *
 * Duplicated rather than imported because the two apps share no runtime code
 * path — the backend's copy lives in `apps/backend/src/lib/base.dto.ts` and is
 * the source of truth. Keep them in step; if a third consumer ever appears,
 * promote this to a shared package instead of copying it again.
 */
export interface Pagination {
  skip: number;
  take: number;
  total: number;
}

export interface BaseResponse<T> {
  data: T;
  pagination?: Pagination;
}
