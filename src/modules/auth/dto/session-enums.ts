/** Kinds of session (stored as Session.sessionType); login creates 'standard' ones */
export enum SessionType {
  STANDARD = 'standard',
  PERSISTENT = 'persistent',
  MOBILE = 'mobile',
  API = 'api',
  ADMIN = 'admin',
  SUSPICIOUS = 'suspicious',
  GUEST = 'guest'
}

/** The values detectDeviceType() (sessions.service) assigns */
export enum DeviceType {
  DESKTOP = 'desktop',
  MOBILE = 'mobile',
  TABLET = 'tablet',
  API_CLIENT = 'api-client',
  BOT = 'bot',
  UNKNOWN = 'unknown'
}
