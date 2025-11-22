import { config } from 'dotenv'
import { DataSource } from 'typeorm'

config()

/**
 * Database Query Performance Analyzer
 *
 * Analyzes slow queries and suggests optimizations
 * Run with: ts-node -r tsconfig-paths/register test/performance/db-performance-check.ts
 */

async function checkDatabasePerformance() {
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'kuybi',
    logging: false
  })

  try {
    console.log('🔌 Connecting to database...\n')
    await dataSource.initialize()
    console.log('✅ Connected to database\n')

    // Check 1: Story Version table statistics
    console.log('📊 Story Version Table Statistics:')
    console.log('='.repeat(60))

    const versionStats = await dataSource.query(`
      SELECT 
        COUNT(*) as total_versions,
        COUNT(DISTINCT story_id) as unique_stories,
        AVG(LENGTH(details::text)) as avg_content_size,
        MAX(version_number) as max_version_number
      FROM story_versions
    `)
    console.log('Total versions:', versionStats[0].total_versions)
    console.log('Unique stories with versions:', versionStats[0].unique_stories)
    console.log('Avg content size:', Math.round(versionStats[0].avg_content_size), 'bytes')
    console.log('Max version number:', versionStats[0].max_version_number)

    // Check 2: Index usage
    console.log('\n📑 Index Analysis:')
    console.log('='.repeat(60))

    const indexes = await dataSource.query(`
      SELECT
        schemaname,
        tablename,
        indexname,
        idx_scan as index_scans,
        idx_tup_read as tuples_read,
        idx_tup_fetch as tuples_fetched
      FROM pg_stat_user_indexes
      WHERE tablename = 'story_versions'
      ORDER BY idx_scan DESC
    `)

    indexes.forEach(idx => {
      console.log(`\n  Index: ${idx.indexname}`)
      console.log(`  Scans: ${idx.index_scans}`)
      console.log(`  Tuples read: ${idx.tuples_read}`)
      console.log(`  Tuples fetched: ${idx.tuples_fetched}`)
    })

    // Check 3: Query performance test
    console.log('\n⏱️  Query Performance Tests:')
    console.log('='.repeat(60))

    const testStoryId = await dataSource.query(`
      SELECT story_id FROM story_versions LIMIT 1
    `)

    if (testStoryId.length > 0) {
      const storyId = testStoryId[0].story_id

      // Test 1: Get version history
      const start1 = Date.now()
      await dataSource.query(
        `
        SELECT * FROM story_versions 
        WHERE story_id = $1 
        ORDER BY version_number DESC 
        LIMIT 20
      `,
        [storyId]
      )
      const duration1 = Date.now() - start1
      console.log(`\n  Get version history (20 items): ${duration1}ms`)

      // Test 2: Get single version
      const start2 = Date.now()
      await dataSource.query(
        `
        SELECT * FROM story_versions 
        WHERE story_id = $1 AND version_number = 1
      `,
        [storyId]
      )
      const duration2 = Date.now() - start2
      console.log(`  Get single version: ${duration2}ms`)

      // Test 3: Count versions
      const start3 = Date.now()
      await dataSource.query(
        `
        SELECT COUNT(*) FROM story_versions 
        WHERE story_id = $1
      `,
        [storyId]
      )
      const duration3 = Date.now() - start3
      console.log(`  Count versions: ${duration3}ms`)

      // Test 4: Complex query with joins
      const start4 = Date.now()
      await dataSource.query(
        `
        SELECT 
          sv.*,
          u.email,
          u.first_name,
          u.last_name
        FROM story_versions sv
        LEFT JOIN users u ON sv.created_by = u.id
        WHERE sv.story_id = $1
        ORDER BY sv.version_number DESC
        LIMIT 20
      `,
        [storyId]
      )
      const duration4 = Date.now() - start4
      console.log(`  Version history with user join: ${duration4}ms`)
    }

    // Check 4: Explain analyze for slow queries
    console.log('\n🔍 Query Plan Analysis:')
    console.log('='.repeat(60))

    if (testStoryId.length > 0) {
      const storyId = testStoryId[0].story_id

      const explain = await dataSource.query(
        `
        EXPLAIN ANALYZE
        SELECT * FROM story_versions 
        WHERE story_id = $1 
        ORDER BY version_number DESC 
        LIMIT 20
      `,
        [storyId]
      )

      console.log('\nQuery: Get version history')
      explain.forEach(line => {
        console.log(`  ${line['QUERY PLAN']}`)
      })
    }

    // Check 5: Missing indexes
    console.log('\n💡 Optimization Suggestions:')
    console.log('='.repeat(60))

    const suggestions = []

    // Check if indexes exist
    const indexCheck = await dataSource.query(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = 'story_versions'
    `)

    const indexNames = indexCheck.map(i => i.indexname)

    if (!indexNames.some(name => name.includes('story_id'))) {
      suggestions.push(
        '⚠️  Missing index on story_id - Add: CREATE INDEX idx_story_versions_story_id ON story_versions(story_id)'
      )
    }

    if (!indexNames.some(name => name.includes('branch_name'))) {
      suggestions.push(
        '⚠️  Missing index on branch_name - Add: CREATE INDEX idx_story_versions_branch ON story_versions(branch_name)'
      )
    }

    if (!indexNames.some(name => name.includes('created_by'))) {
      suggestions.push(
        '⚠️  Missing index on created_by - Add: CREATE INDEX idx_story_versions_created_by ON story_versions(created_by)'
      )
    }

    if (!indexNames.some(name => name.includes('version_number'))) {
      suggestions.push(
        '⚠️  Missing composite index - Add: CREATE INDEX idx_story_versions_story_version ON story_versions(story_id, version_number)'
      )
    }

    if (suggestions.length === 0) {
      console.log('\n✅ All recommended indexes are present!')
    } else {
      console.log('\n')
      suggestions.forEach(s => console.log(s))
    }

    // Check 6: Table size and bloat
    console.log('\n📦 Table Size and Bloat:')
    console.log('='.repeat(60))

    const tableSize = await dataSource.query(`
      SELECT
        pg_size_pretty(pg_total_relation_size('story_versions')) as total_size,
        pg_size_pretty(pg_relation_size('story_versions')) as table_size,
        pg_size_pretty(pg_indexes_size('story_versions')) as indexes_size
    `)

    console.log(`  Total size: ${tableSize[0].total_size}`)
    console.log(`  Table size: ${tableSize[0].table_size}`)
    console.log(`  Indexes size: ${tableSize[0].indexes_size}`)

    // Check 7: Connection pool stats
    console.log('\n🔗 Connection Information:')
    console.log('='.repeat(60))

    const connections = await dataSource.query(
      `
      SELECT 
        COUNT(*) as total_connections,
        COUNT(*) FILTER (WHERE state = 'active') as active_connections,
        COUNT(*) FILTER (WHERE state = 'idle') as idle_connections
      FROM pg_stat_activity
      WHERE datname = $1
    `,
      [process.env.DB_NAME || 'kuybi']
    )

    console.log(`  Total connections: ${connections[0].total_connections}`)
    console.log(`  Active connections: ${connections[0].active_connections}`)
    console.log(`  Idle connections: ${connections[0].idle_connections}`)

    console.log('\n✅ Database analysis complete!\n')
  } catch (error) {
    console.error('❌ Error:', error.message)
    throw error
  } finally {
    await dataSource.destroy()
  }
}

// Run if called directly
if (require.main === module) {
  checkDatabasePerformance().catch(console.error)
}

export { checkDatabasePerformance }
