export const SUPABASE_READ_PAGE_SIZE = 1000;

export type PaginatedReadError = {
  code?: string;
  message: string;
};

export type PaginatedReadResult<T> = {
  data: T[] | null;
  error: PaginatedReadError | null;
};

export type PaginatedReadPage = {
  from: number;
  to: number;
  rowCount: number;
};

/**
 * Read every page of an owner-scoped Supabase query without presenting a
 * partial result as complete. A full page deliberately requests one more
 * page, because an exactly-full final page is indistinguishable from a page
 * with more rows until the probe completes.
 */
export async function fetchAllPagedRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PaginatedReadResult<T>>,
  pageSize = SUPABASE_READ_PAGE_SIZE,
  onPage?: (page: PaginatedReadPage) => void,
): Promise<PaginatedReadResult<T>> {
  const rows: T[] = [];
  const normalizedPageSize = Math.max(1, Math.floor(pageSize));

  for (let from = 0; ; from += normalizedPageSize) {
    const to = from + normalizedPageSize - 1;
    const pageResult = await fetchPage(from, to);
    if (pageResult.error) {
      return { data: null, error: pageResult.error };
    }

    const pageRows = pageResult.data ?? [];
    rows.push(...pageRows);
    onPage?.({ from, to, rowCount: pageRows.length });
    if (pageRows.length < normalizedPageSize) {
      return { data: rows, error: null };
    }
  }
}
