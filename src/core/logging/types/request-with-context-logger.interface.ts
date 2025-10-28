import { Request } from 'express'
import pino from 'pino'

export interface RequestWithContextLogger extends Request {
  contextLogger?: pino.Logger
  user?: {
    id?: string
    email?: string
  }
}
