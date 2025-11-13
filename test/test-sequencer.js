/**
 * Custom Jest Test Sequencer
 * Ensures integration tests run in a specific order to prevent interference
 * 
 * Order:
 * 1. Unit tests (fast, isolated)
 * 2. audit.integration.spec.ts (simple, sets up basic tables)
 * 3. auth.integration.spec.ts (base auth functionality)
 * 4. account-lockout.integration.spec.ts (depends on auth)
 * 5. session-management.integration.spec.ts (depends on auth)
 * 6. user-profile.integration.spec.ts (depends on auth)
 * 7. stories.integration.spec.ts (depends on auth, users, tags, categories)
 */

const Sequencer = require('@jest/test-sequencer').default

class CustomSequencer extends Sequencer {
  /**
   * Sort test files in specific order
   */
  sort(tests) {
    const copyTests = Array.from(tests)

    return copyTests.sort((testA, testB) => {
      const pathA = testA.path
      const pathB = testB.path

      // Define priority order (lower number = runs first)
      const getPriority = (path) => {
        // Unit tests run first (fastest) - keep them together
        if (path.includes('/unit/')) {
          // Alphabetical within unit tests
          return 1
        }

        // Integration tests in dependency order
        if (path.includes('audit.integration.spec.ts')) return 10
        if (path.includes('auth.integration.spec.ts')) return 11
        if (path.includes('account-lockout.integration.spec.ts')) return 12
        if (path.includes('session-management.integration.spec.ts')) return 13
        if (path.includes('user-profile.integration.spec.ts')) return 14
        if (path.includes('stories.integration.spec.ts')) return 15

        // Any other tests run last
        return 99
      }

      const priorityA = getPriority(pathA)
      const priorityB = getPriority(pathB)

      // Sort by priority
      if (priorityA !== priorityB) {
        return priorityA - priorityB
      }

      // If same priority, maintain alphabetical order
      return pathA.localeCompare(pathB)
    })
  }
}

module.exports = CustomSequencer
