# Agent Migration to PostgreSQL

This directory contains scripts to migrate agent JSON files from the current file-based system to a PostgreSQL database on Neon.

## Overview

The migration process:
1. Reads all agent JSON files from `src/` and `locales/` directories
2. Groups them by identifier and locale
3. Generates CSV files for each database table
4. Provides psql commands to import the data

## Prerequisites

- Node.js with TypeScript support
- Access to your Neon PostgreSQL database
- The database schema already created (agents, agent_versions, etc.)

## Running the Migration

### Step 1: Generate CSV Files

```bash
# Navigate to the project root
cd /path/to/lobe-chat-agents

# Run the migration script
npx tsx scripts/migration/migrate-to-postgres.ts
```

This will create a `migration-output/` directory with the following CSV files:
- `agents.csv` - Main agent records
- `agent_versions.csv` - Agent version records
- `agent_version_localizations.csv` - Localized content for agent versions
- `agent_skills.csv` - Agent skills (empty, for future use)
- `agent_skill_localizations.csv` - Localized agent skills (empty, for future use)

### Step 2: Import to PostgreSQL

Connect to your Neon PostgreSQL database and run the following commands:

#### 1. Connect to your database

```bash
# Replace with your actual Neon connection string
psql "postgresql://username:password@your-host.neon.tech/dbname?sslmode=require"
```

#### 2. Import CSV files

**Important**: Update the file paths below to match your actual migration-output directory location.

For example, if your project is at `/Volumes/Macintosh SSD/Developer/lobehub/lobe-chat-agents`, then the path would be:
`/Volumes/Macintosh SSD/Developer/lobehub/lobe-chat-agents/migration-output/agents.csv`

```sql
-- Import agents table (CSV columns match database table order)
\copy agents FROM '/absolute/path/to/migration-output/agents.csv' DELIMITER ',' CSV HEADER;

-- Import agent_versions table (CSV columns match database table order)
\copy agent_versions FROM './migration-output/agent_versions.csv' DELIMITER ',' CSV HEADER;

-- Import agent_version_localizations table (CSV columns match database table order)
\copy agent_version_localizations FROM './migration-output/agent_version_localizations.csv' DELIMITER ',' CSV HEADER;

-- Import agent_skills table (empty for now, CSV columns match database table order)
\copy agent_skills FROM './migration-output/agent_skills.csv' DELIMITER ',' CSV HEADER;

-- Import agent_skill_localizations table (empty for now, CSV columns match database table order)
\copy agent_skill_localizations FROM './migration-output/agent_skill_localizations.csv' DELIMITER ',' CSV HEADER;
```

#### 3. Update sequences (important!)

After importing the data, you need to update the PostgreSQL sequences to ensure new records get correct IDs:

```sql
-- Update sequence for agents table
SELECT setval('agents_id_seq', (SELECT MAX(id) FROM agents));

-- Update sequence for agent_versions table  
SELECT setval('agent_versions_id_seq', (SELECT MAX(id) FROM agent_versions));

-- Update sequence for agent_version_localizations table
SELECT setval('agent_version_localizations_id_seq', (SELECT MAX(id) FROM agent_version_localizations));

-- Update sequence for agent_skills table (if you have data)
SELECT setval('agent_skills_id_seq', (SELECT COALESCE(MAX(id), 0) FROM agent_skills));

-- Update sequence for agent_skill_localizations table (if you have data)
SELECT setval('agent_skill_localizations_id_seq', (SELECT COALESCE(MAX(id), 0) FROM agent_skill_localizations));
```

#### 4. Update foreign key references

Update the agents table to reference the correct current_version_id:

```sql
-- Update agents to point to their version IDs
UPDATE agents 
SET current_version_id = av.id 
FROM agent_versions av 
WHERE agents.id = av.agent_id AND av.is_latest = true;
```

#### 5. Verify the import

```sql
-- Check total counts
SELECT 'agents' as table_name, COUNT(*) as count FROM agents
UNION ALL
SELECT 'agent_versions', COUNT(*) FROM agent_versions  
UNION ALL
SELECT 'agent_version_localizations', COUNT(*) FROM agent_version_localizations
UNION ALL
SELECT 'agent_skills', COUNT(*) FROM agent_skills
UNION ALL
SELECT 'agent_skill_localizations', COUNT(*) FROM agent_skill_localizations;

-- Check sample data
SELECT a.identifier, a.name, av.version, COUNT(avl.id) as localizations
FROM agents a
JOIN agent_versions av ON a.current_version_id = av.id
LEFT JOIN agent_version_localizations avl ON av.id = avl.agent_version_id
GROUP BY a.id, a.identifier, a.name, av.version
ORDER BY a.identifier
LIMIT 10;

-- Check locale distribution
SELECT locale, COUNT(*) as count
FROM agent_version_localizations
GROUP BY locale
ORDER BY count DESC;
```

## Migration Details

### Data Mapping

The migration script maps the JSON agent files to database tables as follows:

#### Agents Table
- `identifier` → extracted from filename or JSON
- `name` → `meta.title`
- `owner_id` → hardcoded to `1` (assuming single account)
- `homepage` → `homepage` field
- `created_at` → `createdAt` field

#### Agent Versions Table
- `name` → `meta.title`
- `description` → `meta.description`
- `summary` → `summary` field
- `category` → `meta.category`
- `config` → entire `config` object as JSON
- `version` → hardcoded to "1.0.0"
- `version_number` → hardcoded to 1

#### Agent Version Localizations Table
- `locale` → extracted from filename (e.g., `zh-CN`, `en-US`)
- `name` → localized `meta.title`
- `description` → localized `meta.description`
- `config` → localized `config` object as JSON

### Assumptions

1. All agents are owned by account ID `1`
2. All agents are marked as official (`is_official = true`)
3. All agents start with version `1.0.0`
4. Files without locale suffix are treated as `en-US`
5. All agents are public and active
6. Agent skills are not included in the current JSON structure

### File Structure

The migration handles two directory structures:

1. **src/** directory: Contains agent files with patterns:
   - `identifier.json` (default/English)
   - `identifier.locale.json` (localized versions)

2. **locales/** directory: Contains additional translations:
   - `identifier/index.locale.json`

## Troubleshooting

### Common Issues

1. **File path errors**: Ensure you use absolute paths in the `\copy` commands
2. **Permission errors**: Make sure PostgreSQL can read the CSV files
3. **Character encoding**: Ensure your database uses UTF-8 encoding
4. **Foreign key constraints**: Import in the correct order (agents → agent_versions → localizations)

### Re-running the migration

If you need to re-run the migration:

```sql
-- Clear existing data (be careful!)
TRUNCATE agent_skill_localizations, agent_skills, agent_version_localizations, agent_versions, agents RESTART IDENTITY CASCADE;
```

Then run the import commands again.

## Next Steps

After successful migration:

1. Verify data integrity with the provided queries
2. Update your application to use the database instead of JSON files
3. Consider adding additional agent skills data if available
4. Set up proper indexing for performance optimization
5. Configure database backups and monitoring 
