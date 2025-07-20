#!/usr/bin/env tsx

import fs from 'fs';
import path from 'path';
import { writeFile, readFile, readdir, stat } from 'fs/promises';

/**
 * Agent JSON structure interface
 */
interface AgentJSON {
  author: string;
  config: {
    systemRole: string;
    model?: string;
    params?: Record<string, any>;
    chatConfig?: Record<string, any>;
    openingMessage?: string;
    openingQuestions?: string[];
  };
  createdAt: string;
  examples?: Array<{
    role: string;
    content: string;
  }>;
  homepage?: string;
  identifier: string;
  knowledgeCount?: number;
  meta: {
    avatar: string;
    description: string;
    tags: string[];
    title: string;
    category: string;
  };
  pluginCount?: number;
  schemaVersion: number;
  summary?: string;
  tokenUsage?: number;
}

/**
 * CSV row interfaces
 */
interface AgentRow {
  created_at: string;
  current_version_id: number;
  homepage: string | null;
  id: number;
  identifier: string;
  is_official: boolean;
  message_count: number;
  name: string;
  owner_id: number;
  updated_at: string;
  status: string;
  visibility: string;
  comment_count: number;
  install_count: number;
  is_featured: boolean;
  rating_average: number;
  rating_count: number;
}

interface AgentVersionRow {
  a2a_protocol_version: string;
  agent_id: number;
  changelog: string | null;
  config: string;
  created_at: string;
  default_input_modes: string;
  default_output_modes: string;
  description: string;
  documentation_url: string | null;
  extensions: string | null;
  has_push_notifications: boolean;
  has_state_transition_history: boolean;
  has_streaming: boolean;
  id: number;
  interfaces: string | null;
  is_latest: boolean;
  is_validated: boolean;
  name: string;
  preferred_transport: string;
  provider_id: number | null;
  security_requirements: string | null;
  security_schemes: string | null;
  summary: string | null;
  supports_authenticated_extended_card: boolean;
  updated_at: string;
  url: string;
  version: string;
  version_number: number;
  category: string | null;
  avatar: string;
  token_usage: number;
}

interface AgentVersionLocalizationRow {
  agent_version_id: number;
  changelog: string | null;
  config: string;
  created_at: string;
  description: string | null;
  id: number;
  locale: string;
  name: string | null;
  short_description: string | null;
}

interface AgentSkillRow {
  agent_version_id: number;
  created_at: string;
  description: string;
  examples: string | null;
  id: number;
  input_modes: string | null;
  name: string;
  output_modes: string | null;
  skill_id: string;
  tags: string;
}

interface AgentSkillLocalizationRow {
  agent_skill_id: number;
  created_at: string;
  description: string;
  examples: string | null;
  id: number;
  locale: string;
  name: string;
  tags: string;
}

/**
 * Utility functions
 */
function escapeCSV(value: any): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function arrayToString(arr: any[]): string {
  if (!arr || arr.length === 0) return '{}';
  return `{${arr.map(item => `"${String(item).replace(/"/g, '\\"')}"`).join(',')}}`;
}

function formatTimestamp(dateString: string | undefined): string {
  if (!dateString) {
    return new Date().toISOString();
  }
  
  // If it's already a full timestamp, return as is
  if (dateString.includes('T') && dateString.includes('Z')) {
    return dateString;
  }
  
  // If it's just a date (YYYY-MM-DD), add time component
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return `${dateString}T00:00:00.000Z`;
  }
  
  // Try to parse and format properly
  try {
    return new Date(dateString).toISOString();
  } catch {
    return new Date().toISOString();
  }
}

async function readJSONFile(filePath: string): Promise<AgentJSON | null> {
  try {
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error);
    return null;
  }
}

async function getAllAgentFiles(): Promise<{[key: string]: {[locale: string]: AgentJSON}}> {
  const agentData: {[key: string]: {[locale: string]: AgentJSON}} = {};
  
  // Read from src/ directory
  const srcDir = path.join(process.cwd(), 'src');
  const srcFiles = await readdir(srcDir);
  
  for (const file of srcFiles) {
    if (!file.endsWith('.json')) continue;
    
    const filePath = path.join(srcDir, file);
    const agent = await readJSONFile(filePath);
    if (!agent) continue;
    
    // Extract locale from filename
    const match = file.match(/^(.+?)(?:\.(.+?))?\.json$/);
    if (!match) continue;
    
    const identifier = match[1];
    const locale = match[2] || 'en-US'; // Default to en-US if no locale
    
    if (!agentData[identifier]) {
      agentData[identifier] = {};
    }
    agentData[identifier][locale] = agent;
  }
  
  // Read from locales/ directory
  const localesDir = path.join(process.cwd(), 'locales');
  try {
    const localesDirs = await readdir(localesDir);
    
    for (const dir of localesDirs) {
      const dirPath = path.join(localesDir, dir);
      const stats = await stat(dirPath);
      if (!stats.isDirectory()) continue;
      
      const files = await readdir(dirPath);
      for (const file of files) {
        if (!file.startsWith('index.') || !file.endsWith('.json')) continue;
        
        const locale = file.replace('index.', '').replace('.json', '');
        const filePath = path.join(dirPath, file);
        const localeData = await readJSONFile(filePath);
        
        if (!localeData) continue;
        
        // If we have base data for this identifier, merge the locale data
        if (agentData[dir] && agentData[dir]['en-US']) {
          const baseData = agentData[dir]['en-US'];
          agentData[dir][locale] = {
            ...baseData,
            ...localeData,
            identifier: dir,
            config: {
              ...baseData.config,
              ...localeData.config
            }
          };
        }
      }
    }
  } catch (error) {
    console.warn('Could not read locales directory:', error);
  }
  
  return agentData;
}

function extractLocale(fileName: string): string {
  const match = fileName.match(/\.([a-z]{2}-[A-Z]{2})\.json$/);
  return match ? match[1] : 'en-US';
}

async function generateCSVFiles() {
  console.log('Starting migration...');
  
  const agentData = await getAllAgentFiles();
  const outputDir = path.join(process.cwd(), 'migration-output');
  
  // Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Data collections
  const agents: AgentRow[] = [];
  const agentVersions: AgentVersionRow[] = [];
  const agentVersionLocalizations: AgentVersionLocalizationRow[] = [];
  
  let agentIdCounter = 1;
  let versionIdCounter = 1;
  let localizationIdCounter = 1;
  
  for (const [identifier, locales] of Object.entries(agentData)) {
    // Get the primary locale (en-US or first available)
    const primaryLocale = locales['en-US'] || Object.values(locales)[0];
    if (!primaryLocale) continue;
    
    const agentId = agentIdCounter++;
    const versionId = versionIdCounter++;
    
    // Create agent record
    const agent: AgentRow = {
      created_at: formatTimestamp(primaryLocale.createdAt),
      current_version_id: versionId,
      homepage: primaryLocale.homepage || null,
      id: agentId,
      identifier: identifier,
      is_official: true, // Assuming all migrated agents are official
      message_count: 0,
      name: primaryLocale.meta.title,
      owner_id: 1, // Assuming all agents are owned by account ID 1
      updated_at: formatTimestamp(undefined),
      status: 'published', // Use 'published' instead of 'active'
      visibility: 'public',
      comment_count: 0,
      install_count: 0,
      is_featured: false,
      rating_average: 0,
      rating_count: 0,
    };
    agents.push(agent);
    
    // Create agent version record
    const agentVersion: AgentVersionRow = {
      a2a_protocol_version: '1.0.0',
      agent_id: agentId,
      changelog: null,
      config: JSON.stringify(primaryLocale.config),
      created_at: formatTimestamp(primaryLocale.createdAt),
      default_input_modes: arrayToString(['text']),
      default_output_modes: arrayToString(['text']),
      description: primaryLocale.meta.description,
      documentation_url: primaryLocale.homepage || null,
      extensions: null,
      has_push_notifications: false,
      has_state_transition_history: false,
      has_streaming: true,
      id: versionId,
      interfaces: null,
      is_latest: true,
      is_validated: true,
      name: primaryLocale.meta.title,
      preferred_transport: 'JSONRPC',
      provider_id: 1,
      security_requirements: null,
      security_schemes: null,
      summary: primaryLocale.summary || null,
      supports_authenticated_extended_card: false,
      updated_at: formatTimestamp(undefined),
      url: `https://api.lobechat.com/agents/${identifier}`,
      version: '1.0.0',
      version_number: 1,
      category: primaryLocale.meta.category || null,
      avatar: primaryLocale.meta.avatar || '🤖',
      token_usage: primaryLocale.tokenUsage || 0,
    };
    agentVersions.push(agentVersion);
    
    // Create localizations for each locale
    for (const [locale, agentData] of Object.entries(locales)) {
      const localization: AgentVersionLocalizationRow = {
        agent_version_id: versionId,
        changelog: null,
        config: JSON.stringify(agentData.config),
        created_at: formatTimestamp(undefined),
        description: agentData.meta.description,
        id: localizationIdCounter++,
        locale: locale,
        name: agentData.meta.title,
        short_description: agentData.meta.description.length > 500 
          ? agentData.meta.description.substring(0, 497) + '...'
          : agentData.meta.description,
      };
      agentVersionLocalizations.push(localization);
    }
  }
  
  // Generate CSV files
  console.log(`Generating CSV files for ${agents.length} agents...`);
  
  // Agents CSV - Order must match database schema
  const agentsCSV = [
    'created_at,current_version_id,homepage,id,identifier,is_official,message_count,name,owner_id,updated_at,status,visibility,comment_count,install_count,is_featured,rating_average,rating_count',
    ...agents.map(a => [
      escapeCSV(a.created_at),
      a.current_version_id,
      escapeCSV(a.homepage),
      a.id,
      escapeCSV(a.identifier),
      a.is_official,
      a.message_count,
      escapeCSV(a.name),
      a.owner_id,
      escapeCSV(a.updated_at),
      escapeCSV(a.status),
      escapeCSV(a.visibility),
      a.comment_count,
      a.install_count,
      a.is_featured,
      a.rating_average,
      a.rating_count,
    ].join(','))
  ].join('\n');
  
  // Agent Versions CSV - Order must match database schema
  const agentVersionsCSV = [
    'a2a_protocol_version,agent_id,changelog,config,created_at,default_input_modes,default_output_modes,description,documentation_url,extensions,has_push_notifications,has_state_transition_history,has_streaming,id,interfaces,is_latest,is_validated,name,preferred_transport,provider_id,security_requirements,security_schemes,summary,supports_authenticated_extended_card,updated_at,url,version,version_number,category,avatar,token_usage',
    ...agentVersions.map(v => [
      escapeCSV(v.a2a_protocol_version),
      v.agent_id,
      escapeCSV(v.changelog),
      escapeCSV(v.config),
      escapeCSV(v.created_at),
      escapeCSV(v.default_input_modes),
      escapeCSV(v.default_output_modes),
      escapeCSV(v.description),
      escapeCSV(v.documentation_url),
      escapeCSV(v.extensions),
      v.has_push_notifications,
      v.has_state_transition_history,
      v.has_streaming,
      v.id,
      escapeCSV(v.interfaces),
      v.is_latest,
      v.is_validated,
      escapeCSV(v.name),
      escapeCSV(v.preferred_transport),
      v.provider_id,
      escapeCSV(v.security_requirements),
      escapeCSV(v.security_schemes),
      escapeCSV(v.summary),
      v.supports_authenticated_extended_card,
      escapeCSV(v.updated_at),
      escapeCSV(v.url),
      escapeCSV(v.version),
      v.version_number,
      escapeCSV(v.category),
      escapeCSV(v.avatar),
      v.token_usage,
    ].join(','))
  ].join('\n');
  
  // Agent Version Localizations CSV - Order must match database schema
  const agentVersionLocalizationsCSV = [
    'agent_version_id,changelog,config,created_at,description,id,locale,name,short_description',
    ...agentVersionLocalizations.map(l => [
      l.agent_version_id,
      escapeCSV(l.changelog),
      escapeCSV(l.config),
      escapeCSV(l.created_at),
      escapeCSV(l.description),
      l.id,
      escapeCSV(l.locale),
      escapeCSV(l.name),
      escapeCSV(l.short_description),
    ].join(','))
  ].join('\n');
  
  // Write CSV files
  await writeFile(path.join(outputDir, 'agents.csv'), agentsCSV);
  await writeFile(path.join(outputDir, 'agent_versions.csv'), agentVersionsCSV);
  await writeFile(path.join(outputDir, 'agent_version_localizations.csv'), agentVersionLocalizationsCSV);
  
  // Generate empty CSV files for tables we don't have data for
  const agentSkillsCSV = 'agent_version_id,created_at,description,examples,id,input_modes,name,output_modes,skill_id,tags\n';
  const agentSkillLocalizationsCSV = 'agent_skill_id,created_at,description,examples,id,locale,name,tags\n';
  
  await writeFile(path.join(outputDir, 'agent_skills.csv'), agentSkillsCSV);
  await writeFile(path.join(outputDir, 'agent_skill_localizations.csv'), agentSkillLocalizationsCSV);
  
  console.log(`\nMigration completed successfully!`);
  console.log(`Generated ${agents.length} agents with ${agentVersions.length} versions and ${agentVersionLocalizations.length} localizations`);
  console.log(`\nCSV files generated in: ${outputDir}`);
  console.log(`- agents.csv (${agents.length} records)`);
  console.log(`- agent_versions.csv (${agentVersions.length} records)`);
  console.log(`- agent_version_localizations.csv (${agentVersionLocalizations.length} records)`);
  console.log(`- agent_skills.csv (empty)`);
  console.log(`- agent_skill_localizations.csv (empty)`);
}

// Run the migration
generateCSVFiles().catch(console.error); 
