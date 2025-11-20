/**
 * Available subjects for authorization
 * These subjects represent resources in the system
 */
export enum Subject {
  /** All subjects - used for super admin */
  All = 'all',

  /** User management */
  User = 'User',

  /** Story management */
  Story = 'Story',

  /** Story version management */
  StoryVersion = 'StoryVersion',

  /** Attachment/file management */
  Attachment = 'Attachment',

  /** Category management */
  Category = 'Category',

  /** Tag management */
  Tag = 'Tag',

  /** Session management */
  Session = 'Session',

  /** Role management (ACL) */
  Role = 'Role',

  /** Permission management (ACL) */
  Permission = 'Permission',

  /** Country data */
  Country = 'Country',

  /** Runtime settings */
  Setting = 'Setting',

  /** Audit log management */
  AuditLog = 'AuditLog',

  /** Post type management (Dynamic Content) */
  PostType = 'PostType',

  /** Field definition management (Dynamic Content) */
  FieldDefinition = 'FieldDefinition',

  /** Content management (Dynamic Content) */
  Content = 'Content'
}
