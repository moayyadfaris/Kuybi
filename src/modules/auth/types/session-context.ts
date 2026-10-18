/** Client details recorded with a session (from the HTTP request) */
export interface SessionContext {
  ipAddress?: string
  userAgent?: string
  deviceType?: string
}
