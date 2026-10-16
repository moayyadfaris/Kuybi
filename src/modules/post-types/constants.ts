/**
 * Post Types Module Constants
 */

// Validation Regex Patterns
// Letters and combining marks from any script (e.g. Arabic), digits, spaces, hyphens, underscores
export const POST_TYPE_NAME_REGEX = /^[\p{L}\p{M}\p{N}\s_-]+$/u
export const POST_TYPE_REST_BASE_REGEX = /^[a-z0-9-_]+$/
export const POST_TYPE_CAPABILITY_TYPE_REGEX = /^[a-z0-9_]+$/
