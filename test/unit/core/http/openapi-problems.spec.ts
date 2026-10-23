import type { OpenAPIObject } from '@nestjs/swagger'

import { addProblemResponses } from '@core/http/openapi-problems'

describe('addProblemResponses', () => {
  const document = () =>
    ({
      openapi: '3.0.0',
      info: { title: 't', version: '1' },
      paths: {
        '/api/v1/stories/{id}': {
          get: {
            responses: {
              '200': { description: 'The story' },
              '404': { description: 'Story not found' }
            }
          }
        }
      }
    }) as unknown as OpenAPIObject

  it('documents every error response as a problem', () => {
    const result = addProblemResponses(document())
    const responses = (result.paths['/api/v1/stories/{id}'].get as { responses: any }).responses

    const problem = {
      'application/problem+json': { schema: { $ref: '#/components/schemas/ProblemDetails' } }
    }
    expect(responses['404'].content).toEqual(problem)
    expect(responses['4XX'].content).toEqual(problem)
    expect(responses['5XX'].content).toEqual(problem)
    expect(responses['200'].content).toBeUndefined()
    expect(result.components?.schemas).toHaveProperty('ProblemDetails')
    expect(result.components?.schemas).toHaveProperty('FieldError')
  })
})
