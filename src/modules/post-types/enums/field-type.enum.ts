/**
 * Field Type Enum
 *
 * Defines all 25 available field types for custom fields in dynamic post types.
 * This enum MUST match the database ENUM: field_type_enum
 *
 * Categories:
 * - Text: text, textarea, wysiwyg, email, url, tel, code
 * - Number: number, currency
 * - Date/Time: date, datetime, time
 * - Selection: checkbox, radio, select, multiselect, toggle
 * - Media: file, image, gallery, video
 * - Relations: relation, user, taxonomy
 * - Advanced: color, json, repeater, group
 *
 * Part of: Phase 1 - Dynamic Post Types System
 * @see docs/planning/DYNAMIC_POST_TYPES_PLAN.md
 * @see src/core/database/migrations/1732000000000-create-post-types-enums.ts
 */
export enum FieldType {
  // ========== Text Fields ==========
  /**
   * Single-line text input
   * Validation: minLength, maxLength, pattern
   * Example: Product name, event title
   */
  TEXT = 'text',

  /**
   * Multi-line text area
   * Validation: minLength, maxLength, rows
   * Example: Description, notes
   */
  TEXTAREA = 'textarea',

  /**
   * Rich text editor (WYSIWYG)
   * Validation: minLength, maxLength, allowedTags
   * Example: Article content, detailed description
   */
  WYSIWYG = 'wysiwyg',

  /**
   * Email address input with validation
   * Validation: pattern, unique
   * Example: Contact email, support email
   */
  EMAIL = 'email',

  /**
   * URL input with validation
   * Validation: pattern, protocol
   * Example: Website, social media link
   */
  URL = 'url',

  /**
   * Telephone number input
   * Validation: pattern, format
   * Example: Phone, fax
   */
  TEL = 'tel',

  /**
   * Code editor with syntax highlighting
   * Validation: language, maxLength
   * Example: Custom CSS, JavaScript snippet
   */
  CODE = 'code',

  // ========== Number Fields ==========
  /**
   * Numeric input (integer or decimal)
   * Validation: min, max, step, integer
   * Example: Quantity, age, rating
   */
  NUMBER = 'number',

  /**
   * Currency/money input with formatting
   * Validation: min, max, currency, decimals
   * Example: Price, discount amount
   */
  CURRENCY = 'currency',

  // ========== Date/Time Fields ==========
  /**
   * Date picker (YYYY-MM-DD)
   * Validation: minDate, maxDate, format
   * Example: Event date, birth date
   */
  DATE = 'date',

  /**
   * Date and time picker (ISO 8601)
   * Validation: minDate, maxDate, timezone
   * Example: Event start time, deadline
   */
  DATETIME = 'datetime',

  /**
   * Time picker (HH:MM:SS)
   * Validation: minTime, maxTime, format
   * Example: Business hours, duration
   */
  TIME = 'time',

  // ========== Selection Fields ==========
  /**
   * Single checkbox (boolean)
   * Validation: required
   * Example: Terms accepted, featured item
   */
  CHECKBOX = 'checkbox',

  /**
   * Radio button group (single choice)
   * Validation: choices, required
   * Example: Size (S/M/L), status
   */
  RADIO = 'radio',

  /**
   * Dropdown select (single choice)
   * Validation: choices, required, allowOther
   * Example: Category, country
   */
  SELECT = 'select',

  /**
   * Multi-select dropdown (multiple choices)
   * Validation: choices, min, max, allowOther
   * Example: Tags, categories
   */
  MULTISELECT = 'multiselect',

  /**
   * Toggle switch (boolean)
   * Validation: default
   * Example: Published, active
   */
  TOGGLE = 'toggle',

  // ========== Media Fields ==========
  /**
   * File upload (any file type)
   * Validation: allowedTypes, maxSize, multiple
   * Example: PDF, document, attachment
   */
  FILE = 'file',

  /**
   * Image upload with preview
   * Validation: allowedTypes, maxSize, dimensions
   * Example: Product image, avatar
   */
  IMAGE = 'image',

  /**
   * Multiple image upload (gallery)
   * Validation: allowedTypes, maxSize, maxCount
   * Example: Product gallery, photo album
   */
  GALLERY = 'gallery',

  /**
   * Video upload or embed
   * Validation: allowedTypes, maxSize, maxDuration
   * Example: Tutorial video, promo
   */
  VIDEO = 'video',

  // ========== Relationship Fields ==========
  /**
   * Relation to other post content
   * Validation: targetPostType, multiple, bidirectional
   * Example: Related products, similar events
   */
  RELATION = 'relation',

  /**
   * Relation to users
   * Validation: roles, multiple
   * Example: Assigned to, team members
   */
  USER = 'user',

  /**
   * Relation to taxonomy (categories/tags)
   * Validation: taxonomy, multiple, createNew
   * Example: Product categories, article tags
   */
  TAXONOMY = 'taxonomy',

  // ========== Advanced Fields ==========
  /**
   * Color picker
   * Validation: format (hex/rgb), alpha
   * Example: Brand color, theme color
   */
  COLOR = 'color',

  /**
   * Raw JSON editor
   * Validation: schema, maxDepth
   * Example: Custom data, API response
   */
  JSON = 'json',

  /**
   * Repeater field (repeatable group of sub-fields)
   * Validation: subFields, min, max
   * Example: FAQ items, team members
   */
  REPEATER = 'repeater',

  /**
   * Group field (sub-fields group)
   * Validation: subFields, layout
   * Example: Address (street, city, zip), contact info
   */
  GROUP = 'group'
}
