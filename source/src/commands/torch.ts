/**
 * [MOD] Torch command — internal debugging/profiling tool.
 *
 * The /torch command provides deep runtime introspection:
 * session state, tool stats, memory usage, active tasks, and more.
 * Originally an internal Anthropic debugging command.
 */

import type { Command } from '../commands.js'

const torch: Command = {
  type: 'local',
  name: 'torch',
  description: 'Deep runtime introspection and debugging',
  argumentHint: '[state | tools | tasks | memory | perf | all]',
  isHidden: false,
  aliases: ['debug'],
  supportsNonInteractive: false,

  async call(args, context) {
    const sub = args?.trim().toLowerCase() || 'state'
    const lines: string[] = []

    if (sub === 'state' || sub === 'all') {
      lines.push('## Runtime State')
      lines.push(`  PID: ${process.pid}`)
      lines.push(`  Uptime: ${Math.round(process.uptime())}s`)
      lines.push(`  Node: ${process.version}`)
      lines.push(`  Platform: ${process.platform} ${process.arch}`)
      lines.push(`  CWD: ${process.cwd()}`)
      lines.push(`  USER_TYPE: ${process.env.USER_TYPE ?? '(unset)'}`)
      lines.push(`  NODE_ENV: ${process.env.NODE_ENV ?? '(unset)'}`)
      lines.push('')
    }

    if (sub === 'memory' || sub === 'all') {
      const mem = process.memoryUsage()
      lines.push('## Memory Usage')
      lines.push(`  RSS: ${(mem.rss / 1024 / 1024).toFixed(1)} MB`)
      lines.push(`  Heap Used: ${(mem.heapUsed / 1024 / 1024).toFixed(1)} MB`)
      lines.push(`  Heap Total: ${(mem.heapTotal / 1024 / 1024).toFixed(1)} MB`)
      lines.push(`  External: ${(mem.external / 1024 / 1024).toFixed(1)} MB`)
      lines.push(`  Array Buffers: ${(mem.arrayBuffers / 1024 / 1024).toFixed(1)} MB`)
      lines.push('')
    }

    if (sub === 'perf' || sub === 'all') {
      const cpuUsage = process.cpuUsage()
      lines.push('## Performance')
      lines.push(`  CPU User: ${(cpuUsage.user / 1000).toFixed(0)} ms`)
      lines.push(`  CPU System: ${(cpuUsage.system / 1000).toFixed(0)} ms`)
      lines.push(`  Event Loop Lag: ~${await measureEventLoopLag()} ms`)
      lines.push('')
    }

    if (sub === 'tools' || sub === 'all') {
      lines.push('## Environment Variables (Code-Folks)')
      const modVars = [
        'USER_TYPE', 'CLAUDE_CODE_ALLOW_ALL_MODELS', 'DISABLE_AUTOUPDATER',
        'CLAUDE_CODE_ENABLE_TELEMETRY', 'CLAUDE_CODE_COORDINATOR_MODE',
        'CLAUDE_CODE_PROACTIVE_TICK_MS', 'CLAUDE_CODE_KAIROS_ENABLED',
        'CLAUDE_CODE_CUSTOM_TOOLS', 'CLAUDE_CODE_CUSTOM_AGENTS',
        'CLAUDE_CODE_MCP_SERVERS', 'CLAUDE_CODE_PREPEND_SYSTEM_PROMPT',
        'CLAUDE_CODE_APPEND_SYSTEM_PROMPT', 'CLAUDE_INTERNAL_FC_OVERRIDES',
      ]
      for (const key of modVars) {
        const val = process.env[key]
        lines.push(`  ${key}: ${val !== undefined ? val || '(empty)' : '(unset)'}`)
      }
      lines.push('')
    }

    if (sub === 'tasks' || sub === 'all') {
      lines.push('## Active Tasks')
      const appState = context.getAppState?.()
      if (appState?.tasks) {
        const active = appState.tasks.filter(
          (t: { status: string }) => t.status === 'running' || t.status === 'pending',
        )
        if (active.length === 0) {
          lines.push('  (none)')
        } else {
          for (const t of active) {
            lines.push(
              `  [${t.status}] ${t.type}: ${(t as { description?: string }).description ?? t.id}`,
            )
          }
        }
      } else {
        lines.push('  (app state not available)')
      }
      lines.push('')
    }

    if (lines.length === 0) {
      lines.push(
        'Usage: /torch [state | tools | tasks | memory | perf | all]',
        '',
        'Subcommands:',
        '  state  — Runtime state (PID, uptime, env)',
        '  tools  — Mod environment variables',
        '  tasks  — Active background tasks',
        '  memory — Heap and RSS memory usage',
        '  perf   — CPU and event loop metrics',
        '  all    — Everything above',
      )
    }

    return { type: 'text', value: lines.join('\n') }
  },
}

async function measureEventLoopLag(): Promise<string> {
  const start = performance.now()
  await new Promise(resolve => setTimeout(resolve, 0))
  return (performance.now() - start).toFixed(1)
}

export default torch
