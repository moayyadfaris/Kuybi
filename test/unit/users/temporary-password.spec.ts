import { generateTemporaryPassword } from '@modules/users/services/admin-password-management.service'

describe('generateTemporaryPassword', () => {
  it('has 12 characters of every required class and no look-alikes', () => {
    for (let i = 0; i < 200; i++) {
      const password = generateTemporaryPassword()
      expect(password).toHaveLength(12)
      expect(password).toMatch(/[A-Z]/)
      expect(password).toMatch(/[a-z]/)
      expect(password).toMatch(/[0-9]/)
      expect(password).toMatch(/[@$!%*?&]/)
      expect(password).not.toMatch(/[IlO01]/)
    }
  })

  it('does not repeat', () => {
    const passwords = new Set(Array.from({ length: 500 }, generateTemporaryPassword))
    expect(passwords.size).toBe(500)
  })
})
