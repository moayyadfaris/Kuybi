import { Repository } from 'typeorm'

import { DEFAULT_ROLE_NAME, findDefaultRoleId } from '@modules/acl/default-role'
import { Role } from '@modules/acl/entities/role.entity'

describe('findDefaultRoleId', () => {
  it('looks the default role up by name, not by a fixed id', async () => {
    const findOne = jest.fn().mockResolvedValue({ id: 17, name: DEFAULT_ROLE_NAME })
    const repo = { findOne } as unknown as Repository<Role>

    await expect(findDefaultRoleId(repo)).resolves.toBe(17)
    expect(findOne).toHaveBeenCalledWith({ where: { name: 'user' }, select: ['id'] })
  })

  it('fails loudly when the ACL seed has not been run', async () => {
    const repo = { findOne: jest.fn().mockResolvedValue(null) } as unknown as Repository<Role>

    await expect(findDefaultRoleId(repo)).rejects.toThrow(/Default role 'user' not found/)
  })
})
