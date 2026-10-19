#!/usr/bin/env node
/**
 * Fails when feature modules depend on each other in a cycle.
 *
 * ESLint (import/no-restricted-paths) already forces cross-module imports through
 * `@modules/<name>` or `@modules/<name>/entities`. Imports of the public API load the
 * other module's Nest module and services, so a cycle among them leaves a class
 * `undefined` while the barrels load. Entity imports are excluded: entities may
 * reference each other (TypeORM relations are lazy).
 *
 * Also fails when a module registers another module's entity with
 * TypeOrmModule.forFeature: that is only needed to inject a raw TypeORM repository for
 * it, which bypasses the owning repository (and its cache invalidation).
 *
 * Usage: node scripts/check-module-graph.js
 */
const fs = require('fs')
const path = require('path')

const MODULES_DIR = path.join(__dirname, '..', 'src', 'modules')
const IMPORT_RE = /from\s+'@modules\/([a-z0-9-]+)(\/entities)?'/g

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return walk(full)
    return entry.name.endsWith('.ts') ? [full] : []
  })
}

const modules = fs
  .readdirSync(MODULES_DIR, { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name)

/** module -> Map(dependency -> first file that imports it) */
const graph = new Map(modules.map(name => [name, new Map()]))

for (const name of modules) {
  for (const file of walk(path.join(MODULES_DIR, name))) {
    const source = fs.readFileSync(file, 'utf8')
    for (const [, dependency, entities] of source.matchAll(IMPORT_RE)) {
      if (entities || dependency === name) continue
      const edges = graph.get(name)
      if (!edges.has(dependency)) edges.set(dependency, path.relative(MODULES_DIR, file))
    }
  }
}

// Depth-first search for back edges
const cycles = []
const state = new Map() // undefined = new, 1 = on stack, 2 = done
function visit(name, stack) {
  state.set(name, 1)
  for (const dependency of graph.get(name)?.keys() ?? []) {
    if (state.get(dependency) === 1) {
      cycles.push([...stack.slice(stack.indexOf(dependency)), dependency])
    } else if (!state.has(dependency)) {
      visit(dependency, [...stack, dependency])
    }
  }
  state.set(name, 2)
}
for (const name of modules) if (!state.has(name)) visit(name, [name])

// forFeature entities must come from the module's own folder
const ownership = []
for (const name of modules) {
  const file = path.join(MODULES_DIR, name, `${name}.module.ts`)
  if (!fs.existsSync(file)) continue
  const source = fs.readFileSync(file, 'utf8')
  const imported = new Map()
  for (const [, names, from] of source.matchAll(/import\s+\{([^}]+)\}\s+from\s+'([^']+)'/g)) {
    for (const id of names.split(',').map(n => n.trim()).filter(Boolean)) imported.set(id, from)
  }
  for (const [, list] of source.matchAll(/TypeOrmModule\.forFeature\(\[([^\]]*)\]/g)) {
    for (const entity of list.split(',').map(e => e.trim()).filter(Boolean)) {
      const from = imported.get(entity) ?? ''
      if (from.startsWith('@modules/')) ownership.push(`${name}: ${entity} (from ${from})`)
    }
  }
}
if (ownership.length > 0) {
  console.error("Modules registering another module's entities (use its repository instead):")
  for (const line of ownership) console.error(`  ${line}`)
  process.exit(1)
}

if (cycles.length > 0) {
  console.error('Module dependency cycles (break one edge, e.g. with a domain event):')
  for (const cycle of cycles) {
    console.error(`  ${cycle.join(' -> ')}`)
    for (let i = 0; i < cycle.length - 1; i++) {
      console.error(`    ${cycle[i]} -> ${cycle[i + 1]}: ${graph.get(cycle[i]).get(cycle[i + 1])}`)
    }
  }
  process.exit(1)
}

const edgeCount = [...graph.values()].reduce((sum, edges) => sum + edges.size, 0)
console.log(`ok: ${modules.length} modules, ${edgeCount} dependencies, no cycles`)
