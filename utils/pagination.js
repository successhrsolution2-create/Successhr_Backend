const DEFAULT_LIMIT = Number(process.env.API_DEFAULT_PAGE_SIZE || 25)
const MAX_LIMIT = Number(process.env.API_MAX_PAGE_SIZE || 100)

const positiveInt = (value, fallback, max = Number.MAX_SAFE_INTEGER) => {
  const parsed = Number.parseInt(String(value || ''), 10)
  if (!Number.isFinite(parsed) || parsed < 1) return fallback
  return Math.min(parsed, max)
}

const wantsPagination = (query = {}) =>
  query.paginated === 'true' ||
  query.page !== undefined ||
  query.limit !== undefined ||
  query.pageSize !== undefined

const getPagination = (query = {}) => {
  const limit = positiveInt(query.limit || query.pageSize, DEFAULT_LIMIT, MAX_LIMIT)
  const page = positiveInt(query.page, 1)
  return {
    limit,
    page,
    skip: (page - 1) * limit
  }
}

const pagedResponse = ({ data, total, page, limit }) => ({
  data,
  pagination: {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit))
  }
})

module.exports = { getPagination, pagedResponse, wantsPagination }
