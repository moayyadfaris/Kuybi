/**
 * Post Types Module Constants
 */

// Validation Regex Patterns
export const POST_TYPE_NAME_REGEX = /^[a-zA-Z0-9\s-_]+$/
export const POST_TYPE_REST_BASE_REGEX = /^[a-z0-9-_]+$/
export const POST_TYPE_CAPABILITY_TYPE_REGEX = /^[a-z0-9_]+$/

// Slug Generation Regex Patterns
export const SLUG_REMOVE_SPECIAL_CHARS_REGEX = /[^\w\s-]/g
export const SLUG_REPLACE_SPACES_REGEX = /[\s_-]+/g
export const SLUG_TRIM_HYPHENS_REGEX = /^-+|-+$/g
