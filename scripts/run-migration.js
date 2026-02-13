// Run database migration
// Usage: node scripts/run-migration.js

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function runMigration() {
  const migrationPath = path.join(__dirname, '../migrations/001_initial_schema.sql')
  const sql = fs.readFileSync(migrationPath, 'utf8')

  console.log('Running migration...')
  
  // Split into individual statements
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s && !s.startsWith('--'))

  for (const statement of statements) {
    if (!statement) continue
    
    try {
      const { error } = await supabase.rpc('exec_sql', { sql: statement + ';' })
      if (error) {
        console.error('Statement error:', error.message)
        console.log('Statement:', statement.substring(0, 100) + '...')
      }
    } catch (err) {
      // Supabase doesn't have exec_sql, so we'll need to use REST API directly
      console.log('Note: Direct SQL execution requires Supabase dashboard')
    }
  }

  console.log('Migration complete - please run in Supabase SQL Editor')
}

runMigration().catch(console.error)
