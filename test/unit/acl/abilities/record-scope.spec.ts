import { createMongoAbility, RawRuleOf } from '@casl/ability'

import { AppAbility } from '@modules/acl/abilities/ability.factory'
import { recordScope } from '@modules/acl/abilities/record-scope'
import { Action } from '@modules/acl/types/actions.enum'
import { Subject } from '@modules/acl/types/subjects.enum'

const COLUMNS = ['status', 'userId']
const scopeOf = (rules: RawRuleOf<AppAbility>[]) =>
  recordScope(createMongoAbility<AppAbility>(rules), Action.Read, Subject.Story, COLUMNS)
const read = (conditions?: Record<string, unknown>, inverted = false): RawRuleOf<AppAbility> => ({
  action: Action.Read,
  subject: Subject.Story,
  conditions,
  inverted
})

describe('recordScope', () => {
  it('allows every record for an unconditional rule (also via manage all)', () => {
    expect(scopeOf([read({ status: 'PUBLISHED' }), read()])).toEqual({ all: true })
    expect(scopeOf([{ action: Action.Manage, subject: Subject.All }])).toEqual({ all: true })
  })

  it('ORs conditional rules', () => {
    expect(scopeOf([read({ status: 'PUBLISHED' }), read({ userId: 'u1' })])).toEqual({
      all: false,
      anyOf: expect.arrayContaining([{ status: 'PUBLISHED' }, { userId: 'u1' }])
    })
  })

  it('allows nothing without a read rule', () => {
    expect(scopeOf([])).toEqual({ all: false, anyOf: [] })
  })

  it('fails closed on what it cannot translate exactly', () => {
    // Operators and columns outside the allowlist: the rule is skipped
    expect(scopeOf([read({ status: { $in: ['PUBLISHED'] } }), read({ secret: 1 })])).toEqual({
      all: false,
      anyOf: []
    })
    // A cannot rule ends the scan: everything below it could be restricted by it
    expect(scopeOf([read(), read({ status: 'DRAFT' }, true)])).toEqual({ all: false, anyOf: [] })
  })
})
