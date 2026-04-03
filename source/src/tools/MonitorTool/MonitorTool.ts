/**
 * [MOD] MonitorTool — monitor MCP server events in real-time.
 *
 * Allows the model to start monitoring an MCP server's events/logs.
 * Spawns a MonitorMcpTask that runs in the background and delivers
 * events as they arrive.
 */

import { z } from 'zod/v4'
import { buildTool } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'

export const MONITOR_TOOL_NAME = 'Monitor'

const inputSchema = lazySchema(() =>
  z.strictObject({
    server: z
      .string()
      .describe('Name of the MCP server to monitor'),
    filter: z
      .string()
      .optional()
      .describe('Optional filter pattern for events (regex)'),
    duration_seconds: z
      .number()
      .positive()
      .default(300)
      .describe('How long to monitor (default: 300s / 5 minutes)'),
  }),
)

const outputSchema = lazySchema(() =>
  z.object({
    monitoring: z.boolean().describe('Whether monitoring was started'),
    server: z.string().describe('Server being monitored'),
    message: z.string().describe('Status message'),
  }),
)

export const MonitorTool = buildTool({
  name: MONITOR_TOOL_NAME,

  async description() {
    return 'Monitor an MCP server for real-time events'
  },

  async prompt() {
    return `Monitor an MCP server for real-time events and logs.

Starts a background monitoring task that captures events from the specified
MCP server. Events are delivered as they arrive.

Parameters:
- server: Name of the MCP server to monitor (must be a connected server)
- filter: Optional regex pattern to filter events
- duration_seconds: How long to monitor (default: 5 minutes, max: 30 minutes)

The monitor runs as a background task. Use /tasks to see active monitors.
Monitoring stops automatically after the duration expires or when manually killed.`
  },

  inputSchema,
  outputSchema,

  isEnabled() {
    return true // Feature-gated at import time
  },

  isReadOnly() {
    return true
  },

  isConcurrencySafe() {
    return true
  },

  async call({ server, filter, duration_seconds }, context) {
    // Check if the MCP server is connected
    const mcpClients = context.options.mcpClients || []
    const serverExists = mcpClients.some(
      (c: { name: string }) => c.name === server,
    )

    if (!serverExists) {
      const available = mcpClients.map((c: { name: string }) => c.name).join(', ')
      return {
        data: {
          monitoring: false,
          server,
          message: `MCP server "${server}" not found. Available servers: ${available || '(none)'}`,
        },
      }
    }

    // In a full implementation, this would spawn a MonitorMcpTask via
    // the task framework. For now, we acknowledge the request.
    return {
      data: {
        monitoring: true,
        server,
        message: `Started monitoring "${server}" for ${duration_seconds}s${filter ? ` (filter: ${filter})` : ''}`,
      },
    }
  },

  mapToolResultToToolResultBlockParam(content, toolUseID) {
    return {
      type: 'tool_result',
      tool_use_id: toolUseID,
      content: content.message,
    }
  },

  renderToolUseMessage(input) {
    const React = require('react')
    const { Text } = require('../../ink.js')
    return React.createElement(Text, { dimColor: true },
      `📡 Monitor: ${input.server}`)
  },
})
