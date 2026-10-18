declare global {
  namespace Express {
    /** Set by RequestIdMiddleware */
    interface Request {
      id?: string
      requestId?: string
      /** Session of the request's access token (`sid` claim); set by JwtStrategy */
      sessionId?: string
    }

    /** Authenticated principal attached by JwtStrategy (a User entity) */
    interface User {
      id: string
      email?: string
    }

    interface MulterFile {
      fieldname: string
      originalname: string
      encoding: string
      mimetype: string
      size: number
      buffer: Buffer
    }
  }
}

export {}
