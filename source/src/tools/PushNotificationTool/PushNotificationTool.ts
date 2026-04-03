/**
 * [MOD] PushNotificationTool — send push notifications to the user's device.
 *
 * In full KAIROS mode, notifications are routed through the bridge to the
 * user's mobile device. This implementation provides the tool interface
 * and falls back to terminal notification when no bridge is active.
 */

import { z } from 'zod/v4'
import { buildTool } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'

export const PUSH_NOTIFICATION_TOOL_NAME = 'PushNotification'

const inputSchema = lazySchema(() =>
  z.strictObject({
    title: z
      .string()
      .max(100)
      .describe('Short notification title (max 100 chars)'),
    body: z
      .string()
      .max(500)
      .describe('Notification body text (max 500 chars)'),
    urgency: z
      .enum(['low', 'normal', 'high'])
      .default('normal')
      .describe('Notification urgency level'),
  }),
)

const outputSchema = lazySchema(() =>
  z.object({
    delivered: z.boolean().describe('Whether the notification was delivered'),
    method: z.string().describe('Delivery method used'),
  }),
)

export const PushNotificationTool = buildTool({
  name: PUSH_NOTIFICATION_TOOL_NAME,

  async description() {
    return 'Send a push notification to the user\'s device'
  },

  async prompt() {
    return `Send a push notification to the user's device.

Use this when:
- A long-running task completes and the user may have stepped away
- You need the user's attention for a permission prompt or question
- The user explicitly asked to be notified

Configuration: Users can control notifications via settings:
- taskCompleteNotifEnabled: Auto-notify on task completion
- inputNeededNotifEnabled: Auto-notify when input is needed
- agentPushNotifEnabled: Allow agent-initiated notifications

Keep notifications concise — mobile screens have limited space.
Do not spam — only notify when genuinely useful.`
  },

  inputSchema,
  outputSchema,

  isEnabled() {
    // Available in KAIROS or when KAIROS_PUSH_NOTIFICATION flag is enabled
    try {
      const { isAssistantMode } = require('../../assistant/index.js') as typeof import('../../assistant/index.js')
      return isAssistantMode()
    } catch {
      return true // Flag-gated at import time; if we're loaded, we're enabled
    }
  },

  isReadOnly() {
    return true
  },

  isConcurrencySafe() {
    return true
  },

  async call({ title, body, urgency }) {
    // In a full implementation, this would route through the bridge
    // to deliver a push notification to the user's mobile device.
    // For now, emit a terminal bell + formatted message as fallback.
    const bellChar = urgency === 'high' ? '\x07' : ''
    process.stderr.write(`${bellChar}\n📱 [${urgency.toUpperCase()}] ${title}\n   ${body}\n\n`)

    return {
      data: {
        delivered: true,
        method: 'terminal-fallback',
      },
    }
  },

  mapToolResultToToolResultBlockParam(content, toolUseID) {
    return {
      type: 'tool_result',
      tool_use_id: toolUseID,
      content: content.delivered
        ? `Notification delivered via ${content.method}`
        : 'Notification delivery failed',
    }
  },

  renderToolUseMessage(input) {
    const React = require('react')
    const { Text } = require('../../ink.js')
    return React.createElement(Text, { dimColor: true },
      `📱 Push: ${input.title}`)
  },
})
