import type { LocalCommandCall } from '../../types/command.js'

const API_ENDPOINTS = `
## API Endpoints Map

### Core API
- POST {BASE}/v1/messages — Main chat/completion endpoint
- POST {BASE}/api/claude_cli/bootstrap — Runtime config bootstrap
- POST {BASE}/api/event_logging/batch — 1P event logging (DISABLED)
- GET  {BASE}/api/claude_code/organizations/metrics_enabled — BigQuery metrics opt-out (DISABLED)
- POST {BASE}/api/claude_code/metrics — BigQuery metrics export (DISABLED)

### Authentication
- GET  https://claude.com/cai/oauth/authorize — OAuth login (Claude AI subscribers)
- POST https://platform.claude.com/v1/oauth/token — Token exchange/refresh
- POST {BASE}/api/oauth/claude_cli/create_api_key — API key creation via OAuth
- GET  {BASE}/api/oauth/claude_cli/roles — Organizational roles

### Telemetry (ALL DISABLED)
- POST https://http-intake.logs.us5.datadoghq.com/api/v2/logs — Datadog (KILLED)
- POST {BASE}/api/event_logging/batch — 1P events (KILLED)
- POST {BASE}/api/claude_code/metrics — BigQuery (KILLED)
- OTEL endpoints via OTEL_EXPORTER_OTLP_ENDPOINT (NOT ACTIVE)

### MCP Proxy
- POST https://mcp-proxy.anthropic.com/v1/mcp/{server_id} — Production
- POST https://mcp-proxy-staging.anthropic.com/v1/mcp/{server_id} — Staging

### Plugins
- GET  https://downloads.claude.ai/claude-code-releases/plugins/claude-plugins-official/latest — Plugin catalog
- GET  https://downloads.claude.ai/claude-code-releases/plugins/claude-plugins-official/{sha}.zip — Plugin download

### MCP OAuth
- GET  https://claude.ai/oauth/claude-code-client-metadata — OIDC client metadata

### Environment Variable Overrides
- ANTHROPIC_BASE_URL — Override API base (for Bedrock/Vertex/Foundry/self-hosted)
- ANTHROPIC_FOUNDRY_BASE_URL — Azure Foundry specific endpoint
- ANTHROPIC_CUSTOM_HEADERS — Extra auth headers
- CLAUDE_CODE_CUSTOM_OAUTH_URL — FedStart/PubSec OAuth override

### Third-Party Provider Endpoints
- AWS Bedrock: bedrock-runtime.{region}.amazonaws.com
- Google Vertex AI: {region}-aiplatform.googleapis.com
- Azure Foundry: {ANTHROPIC_FOUNDRY_BASE_URL}

Where {BASE} = process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com"
`

const FEATURE_FLAGS = [
  'ABLATION_BASELINE', 'AGENT_MEMORY_SNAPSHOT', 'AGENT_TRIGGERS', 'AGENT_TRIGGERS_REMOTE',
  'ALLOW_TEST_VERSIONS', 'ANTI_DISTILLATION_CC', 'AUTO_THEME', 'AWAY_SUMMARY',
  'BASH_CLASSIFIER', 'BG_SESSIONS', 'BREAK_CACHE_COMMAND', 'BRIDGE_MODE',
  'BUDDY', 'BUILDING_CLAUDE_APPS', 'BUILTIN_EXPLORE_PLAN_AGENTS', 'BYOC_ENVIRONMENT_RUNNER',
  'CACHED_MICROCOMPACT', 'CCR_AUTO_CONNECT', 'CCR_MIRROR', 'CCR_REMOTE_SETUP',
  'CHICAGO_MCP', 'COMMIT_ATTRIBUTION', 'COMPACTION_REMINDERS', 'CONNECTOR_TEXT',
  'CONTEXT_COLLAPSE', 'COORDINATOR_MODE', 'COWORKER_TYPE_TELEMETRY', 'DAEMON',
  'DIRECT_CONNECT', 'DOWNLOAD_USER_SETTINGS', 'DUMP_SYSTEM_PROMPT', 'ENHANCED_TELEMETRY_BETA',
  'EXPERIMENTAL_SKILL_SEARCH', 'EXTRACT_MEMORIES', 'FILE_PERSISTENCE', 'FORK_SUBAGENT',
  'HARD_FAIL', 'HISTORY_PICKER', 'HISTORY_SNIP', 'HOOK_PROMPTS',
  'IS_LIBC_GLIBC', 'KAIROS', 'KAIROS_BRIEF', 'KAIROS_CHANNELS',
  'KAIROS_DREAM', 'KAIROS_GITHUB_WEBHOOKS', 'KAIROS_PUSH_NOTIFICATION', 'LODESTONE',
  'MCP_RICH_OUTPUT', 'MCP_SKILLS', 'MEMORY_SHAPE_TELEMETRY', 'MESSAGE_ACTIONS',
  'MONITOR_TOOL', 'NATIVE_CLIENT_ATTESTATION', 'NATIVE_CLIPBOARD_IMAGE', 'NEW_INIT',
  'OVERFLOW_TEST_TOOL', 'PERFETTO_TRACING', 'POWERSHELL_AUTO_MODE', 'PROACTIVE',
  'PROMPT_CACHE_BREAK_DETECTION', 'QUICK_SEARCH', 'REACTIVE_COMPACT', 'REVIEW_ARTIFACT',
  'RUN_SKILL_GENERATOR', 'SELF_HOSTED_RUNNER', 'SKILL_IMPROVEMENT',
  'SKIP_DETECTION_WHEN_AUTOUPDATES_DISABLED', 'SLOW_OPERATION_LOGGING', 'SSH_REMOTE',
  'STREAMLINED_OUTPUT', 'TEAMMEM', 'TEMPLATES', 'TERMINAL_PANEL',
  'TOKEN_BUDGET', 'TORCH', 'TRANSCRIPT_CLASSIFIER', 'TREE_SITTER_BASH',
  'TREE_SITTER_BASH_SHADOW', 'UDS_INBOX', 'ULTRAPLAN', 'ULTRATHINK',
  'UNATTENDED_RETRY', 'UPLOAD_USER_SETTINGS', 'VERIFICATION_AGENT', 'VOICE_MODE',
  'WEB_BROWSER_TOOL', 'WORKFLOW_SCRIPTS',
]

const COORDINATOR_PROTOCOL = `
## Coordinator Mode Protocol

### Enable
  CLAUDE_CODE_COORDINATOR_MODE=1 node dist/cli.js

### Coordinator Tools
  Agent — Spawn new worker agents
  SendMessage — Send follow-up messages to running workers (by agent ID)
  TaskStop — Kill running workers
  subscribe_pr_activity / unsubscribe_pr_activity — GitHub PR event subscriptions

### Worker Tools
  Standard mode: Full tools + MCP servers + Skills (/commit, /verify, etc.)
  Simple mode (CLAUDE_CODE_SIMPLE=1): Bash, Read, Edit + MCP tools only

### Protocol
  1. Coordinator spawns workers via Agent tool with self-contained prompts
  2. Workers execute independently (parallel OK)
  3. On completion, coordinator receives <task-notification> XML:
     <task-notification>
       <task-id>{agentId}</task-id>
       <status>completed|failed|killed</status>
       <summary>{outcome}</summary>
       <result>{final response}</result>
       <usage>
         <total_tokens>N</total_tokens>
         <tool_uses>N</tool_uses>
         <duration_ms>N</duration_ms>
       </usage>
     </task-notification>
  4. Coordinator synthesizes results, sends follow-ups via SendMessage, or spawns new workers

### Key Rules
  - NEVER predict worker results — wait for notifications
  - Parallelize independent tasks (spawn multiple workers at once)
  - Include file paths + line numbers when directing implementation work
  - Continue workers for related follow-up; spawn fresh for unrelated tasks
`

const MODS_SUMMARY = `
## Code-Folks Mod Summary

### Build-Time Mods
  - 90/90 feature flags enabled (was 4)
  - USER_TYPE = 'ant' (Anthropic internal staff mode)
  - Anti-distillation injection disabled
  - Native client attestation disabled
  - Datadog endpoint blanked
  - Experimental betas disabled

### Runtime Mods
  - All analytics/telemetry always disabled
  - 1P event logging always disabled
  - BigQuery metrics always disabled
  - Bypass-permissions killswitch neutered
  - Auto-mode gate check neutered
  - GrowthBook env overrides work without ant gate
  - Permission mode defaults to bypassPermissions
  - Model allowlist bypassed (all models allowed)
  - Update checker skipped
  - Token budget threshold raised (90% → 98%)
  - Auto-compact buffer reduced (13k → 5k tokens)
  - Retry count doubled (10 → 20), backoff halved (500ms → 250ms)
  - 529 retries increased (3 → 8)
  - Launch screen skippable on any keypress
  - Hidden commands exposed (/heapdump, /rate-limit-options)
  - /buddy companion system fully functional

### Environment Variables
  CLAUDE_CODE_PREPEND_SYSTEM_PROMPT — Inject before system prompt
  CLAUDE_CODE_APPEND_SYSTEM_PROMPT — Inject after system prompt
  CLAUDE_INTERNAL_FC_OVERRIDES — Override GrowthBook flags (JSON)
  CLAUDE_CODE_FORCE_UPDATE_CHECK=1 — Force update check
  CLAUDE_CODE_ALLOW_ALL_MODELS=0 — Re-enable model allowlist
  CLAUDE_CODE_MCP_SERVERS — Auto-inject MCP servers (JSON)
  CLAUDE_CODE_CUSTOM_TOOLS — Inject custom tool definitions (JSON)
  ANTHROPIC_MODEL — Override default model
  ANTHROPIC_DEFAULT_OPUS_MODEL — Override opus default
  ANTHROPIC_DEFAULT_SONNET_MODEL — Override sonnet default
  ANTHROPIC_DEFAULT_HAIKU_MODEL — Override haiku default
  CLAUDE_CODE_COORDINATOR_MODE=1 — Enable coordinator mode
  NO_LAUNCH_SCREEN=1 — Skip launch animation entirely
`

export const call: LocalCommandCall = async (args) => {
  const sub = args.trim().toLowerCase()

  if (sub === 'endpoints' || sub === 'api') {
    return { type: 'text', value: API_ENDPOINTS }
  }

  if (sub === 'flags') {
    return {
      type: 'text',
      value: `## All 90 Feature Flags (ALL ENABLED)\n\n${FEATURE_FLAGS.map((f, i) => `  ${String(i + 1).padStart(2)}. ${f}`).join('\n')}\n`,
    }
  }

  if (sub === 'coordinator') {
    return { type: 'text', value: COORDINATOR_PROTOCOL }
  }

  if (sub === 'config') {
    const env: Record<string, string | undefined> = {
      USER_TYPE: process.env.USER_TYPE,
      NODE_ENV: process.env.NODE_ENV,
      ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
      ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL,
      CLAUDE_CODE_ENTRYPOINT: process.env.CLAUDE_CODE_ENTRYPOINT,
      CLAUDE_CODE_COORDINATOR_MODE: process.env.CLAUDE_CODE_COORDINATOR_MODE,
      CLAUDE_CODE_PREPEND_SYSTEM_PROMPT: process.env.CLAUDE_CODE_PREPEND_SYSTEM_PROMPT,
      CLAUDE_CODE_APPEND_SYSTEM_PROMPT: process.env.CLAUDE_CODE_APPEND_SYSTEM_PROMPT,
      CLAUDE_INTERNAL_FC_OVERRIDES: process.env.CLAUDE_INTERNAL_FC_OVERRIDES,
      CLAUDE_CODE_CUSTOM_TOOLS: process.env.CLAUDE_CODE_CUSTOM_TOOLS,
      CLAUDE_CODE_MCP_SERVERS: process.env.CLAUDE_CODE_MCP_SERVERS,
    }
    const lines = Object.entries(env)
      .map(([k, v]) => `  ${k} = ${v ?? '(unset)'}`)
      .join('\n')
    return { type: 'text', value: `## Runtime Config\n\n${lines}\n` }
  }

  if (sub === 'mods') {
    return { type: 'text', value: MODS_SUMMARY }
  }

  // Default: show all sections
  return {
    type: 'text',
    value: [
      MODS_SUMMARY,
      '\nRun with a subcommand for details:',
      '  /dump-info endpoints  — All API endpoints',
      '  /dump-info flags      — All 90 feature flags',
      '  /dump-info config     — Current runtime environment',
      '  /dump-info coordinator — Coordinator mode protocol',
      '  /dump-info mods       — Full mod summary',
      '  /dump-info prompt     — Use --dump-system-prompt CLI flag to dump the full system prompt',
      '',
    ].join('\n'),
  }
}
