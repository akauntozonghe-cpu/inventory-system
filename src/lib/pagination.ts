export function pageWindow(total: number, requestedPage: number, pageSize = 30) {
  const size = Math.max(1, Math.floor(pageSize));
  const count = Math.max(0, Math.floor(total));
  const totalPages = Math.max(1, Math.ceil(count / size));
  const page = Math.max(1, Math.min(totalPages, Math.floor(requestedPage) || 1));
  const start = (page - 1) * size;
  return { page, totalPages, start, end: Math.min(count, start + size), total: count };
}
