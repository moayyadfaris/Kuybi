// @ts-check
import eslint from '@eslint/js'
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript'
import importX from 'eslint-plugin-import-x'
import prettierRecommended from 'eslint-plugin-prettier/recommended'
import simpleImportSort from 'eslint-plugin-simple-import-sort'
import unusedImports from 'eslint-plugin-unused-imports'
import globals from 'globals'
import tseslint from 'typescript-eslint'

import { readdirSync } from 'node:fs'
import { join } from 'node:path'

/** Shared: a later block's no-restricted-syntax replaces earlier ones instead of merging */
const NO_ANY_CAST = {
  selector: 'TSAsExpression > TSAnyKeyword',
  message: 'Do not cast to `any`; use a precise type or `as unknown as T`.'
}

/** Data access rule (see the feature-module block below) */
const DATA_ACCESS_SELECTORS = [
  {
    selector:
      'Decorator > CallExpression[callee.name=/^Inject(Repository|DataSource|EntityManager)$/]',
    message:
      "Use the owning module's repository (writes through it invalidate its caches), not a TypeORM repository, DataSource or EntityManager."
  },
  {
    selector:
      'TSParameterProperty TSTypeReference > Identifier[name=/^(DataSource|EntityManager)$/]',
    message:
      'Do not inject a DataSource or EntityManager; run transactions with <repository>.transaction(work).'
  }
]

/** Controllers return the payload; TransformInterceptor adds the envelope */
const SELF_WRAPPED_RESPONSE = {
  // TransformInterceptor wraps every response in { success, data }; a handler
  // that adds its own produced { success, data: { success, data } }
  selector:
    "MethodDefinition > FunctionExpression > BlockStatement > ReturnStatement > ObjectExpression > Property[key.name='success']",
  message: 'Return the payload only: TransformInterceptor adds { success, data } to every response.'
}

const MODULES = readdirSync(join(import.meta.dirname, 'src/modules'), { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name)

export default tseslint.config(
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'eslint.config.mjs']
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettierRecommended,
  {
    // Plain Node.js (CommonJS) tooling scripts
    files: ['scripts/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...globals.node }
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      'no-console': 'off'
    }
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: 'tsconfig.eslint.json',
        tsconfigRootDir: import.meta.dirname
      },
      globals: {
        ...globals.node,
        ...globals.jest
      }
    },
    plugins: {
      'simple-import-sort': simpleImportSort,
      'unused-imports': unusedImports,
      'import-x': importX
    },
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off', // Handled by unused-imports
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_'
        }
      ],
      'simple-import-sort/imports': [
        'error',
        {
          groups: [
            // Packages
            ['^@nestjs', '^@?\\w'],
            // Internal modules
            ['^@modules(/.*|$)'],
            // Core and shared
            ['^@core(/.*|$)', '^@common(/.*|$)'],
            // Side effect imports
            ['^\\u0000'],
            // Parent imports. Put `..` last.
            ['^\\.\\.(?!/?$)', '^\\.\\./?$'],
            // Other relative imports. Put same-folder imports and `.` last.
            ['^\\./(?=.*/)(?!/?$)', '^\\.(?!/?$)', '^\\./?$']
          ]
        }
      ],
      'simple-import-sort/exports': 'error',
      'import-x/first': 'error',
      'import-x/newline-after-import': 'error',
      'import-x/no-duplicates': 'error',
      'prettier/prettier': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }]
    }
  },
  {
    // Command-line entry points (dashboard, migration and seed scripts) and tests print
    // to the console by design; application code uses the Pino logger
    files: [
      'test/**/*.ts',
      'src/dashboard.ts',
      'src/database/scripts/**/*.ts',
      'src/modules/*/seeders/seed-*.ts'
    ],
    rules: {
      'no-console': 'off'
    }
  },
  {
    // `as any` silences the compiler and has hidden real bugs here (ignored soft-delete
    // filters, a broken log shipper). Use a precise type or `as unknown as T` instead.
    files: ['src/**/*.ts'],
    rules: {
      // src has no explicit `any` left (Oct 2026); keep it that way. Tests may use it.
      '@typescript-eslint/no-explicit-any': 'error',
      'no-restricted-properties': [
        'error',
        {
          property: 'withMetadata',
          message:
            "sharp's withMetadata() KEEPS the input's EXIF (GPS, camera serials). Output has none by default; use keepIccProfile() for colour, keepMetadata() only when metadata must survive."
        }
      ],
      'no-restricted-syntax': ['error', NO_ANY_CAST]
    }
  },
  {
    // acl is a base module: feature modules depend on it, never the reverse. It
    // authorizes an AclPrincipal and string subjects instead of importing User or Story.
    // Entities are the exception: UserRole has a real foreign key to users, and the
    // relation must stay declared for the schema (entity graphs are not module deps).
    files: ['src/modules/acl/**/*.ts'],
    ignores: ['src/modules/acl/entities/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@modules/*', '!@modules/acl', '!@modules/acl/**'],
              message:
                'acl must not depend on feature modules; describe what it needs (see AclPrincipal) or invert the dependency.'
            }
          ]
        }
      ]
    }
  },
  {
    // Data access rule: inside feature modules only repositories (and seeders) touch
    // TypeORM. Services, jobs, guards and controllers go through the owning module's
    // repository, whose writes invalidate its caches (see BaseRepository). Transactions:
    // <repository>.transaction(work), never an injected DataSource or EntityManager.
    files: ['src/modules/**/*.ts'],
    ignores: [
      'src/modules/*/repositories/**',
      'src/modules/*/database/**',
      'src/modules/*/seeders/**'
    ],
    rules: {
      'no-restricted-syntax': ['error', NO_ANY_CAST, ...DATA_ACCESS_SELECTORS]
    }
  },
  {
    // TransformInterceptor wraps every response in { success, data }; a handler that
    // adds its own produced { success, data: { success, data } }
    files: ['src/modules/*/controllers/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        NO_ANY_CAST,
        ...DATA_ACCESS_SELECTORS,
        SELF_WRAPPED_RESPONSE
      ]
    }
  },
  {
    // Repositories cache only through BaseRepository.cached()/cacheSet(), which tag
    // entries so that every write through the repository invalidates them
    files: ['src/modules/*/repositories/**/*.ts', 'src/modules/*/database/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        NO_ANY_CAST,
        {
          selector:
            "CallExpression[callee.object.object.type='ThisExpression'][callee.object.property.name='cacheService'][callee.property.name=/^(wrap|set|wrapWithTags|setWithTags)$/]",
          message:
            'Cache with this.cached() / this.cacheSet(): only their tags are invalidated by writes through the repository.'
        }
      ]
    }
  },
  {
    // Architecture boundaries (application code only; tests may reach into internals).
    //   shared         -> nothing above it
    //   core, infra    -> shared (and each other), never feature modules or src/database
    //   modules/<m>    -> another module only via its public entry points:
    //                     @modules/<other> (index.ts) and @modules/<other>/entities
    // src/app.module.ts, src/worker.module.ts and src/database are the composition roots.
    files: ['src/**/*.ts'],
    settings: {
      'import-x/resolver-next': [createTypeScriptImportResolver({ project: 'tsconfig.json' })]
    },
    rules: {
      'import-x/no-restricted-paths': [
        'error',
        {
          zones: [
            {
              target: './src/shared',
              from: ['./src/core', './src/infrastructure', './src/modules', './src/database'],
              message: 'shared/ holds framework-free utilities and must not depend on other layers.'
            },
            {
              target: ['./src/core', './src/infrastructure'],
              from: ['./src/modules', './src/database'],
              message:
                'core/ and infrastructure/ must not depend on feature modules; invert the dependency (e.g. a domain event).'
            },
            ...MODULES.map(name => ({
              target: `./src/modules/${name}`,
              from: './src/modules',
              except: [
                `./${name}`,
                ...MODULES.flatMap(other => [`./${other}/index.ts`, `./${other}/entities/index.ts`])
              ],
              message:
                'Import other modules only through their public API: @modules/<name> or @modules/<name>/entities.'
            }))
          ]
        }
      ]
    }
  }
)
