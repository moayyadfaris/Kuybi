/**
 * Available actions for authorization
 * These actions represent what a user can do to a subject
 */
export enum Action {
  /** Full access - all actions on a subject */
  Manage = 'manage',

  /** Create new resources */
  Create = 'create',

  /** Read/view resources */
  Read = 'read',

  /** Update/modify existing resources */
  Update = 'update',

  /** Delete resources */
  Delete = 'delete',

  /** Restore soft-deleted resources */
  Restore = 'restore',

  /** Export data */
  Export = 'export',

  /** Import data */
  Import = 'import',

  /** Publish resources (e.g., stories) */
  Publish = 'publish',

  /** Archive resources */
  Archive = 'archive',

  /** Moderate content */
  Moderate = 'moderate',

  /** Assign permissions or roles */
  Assign = 'assign',
}
