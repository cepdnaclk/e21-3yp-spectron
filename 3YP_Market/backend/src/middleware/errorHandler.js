export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  })
}

export function errorHandler(error, req, res, next) {
  const statusCode = error.statusCode || 500

  if (statusCode >= 500) {
    console.error(error)
  }

  res.status(statusCode).json({
    success: false,
    message: statusCode >= 500 && !error.expose ? 'Internal server error' : error.message,
  })
}
