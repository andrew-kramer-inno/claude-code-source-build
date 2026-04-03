/**
 * [MOD] SubscribePRTool — subscribe to GitHub PR webhook events.
 *
 * Enables the model to subscribe to PR activity (comments, CI results,
 * reviews) which arrive as <github-webhook-activity> user messages.
 * Works through the bridge/MCP infrastructure.
 */

import { z } from 'zod/v4'
import { buildTool } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'

export const SUBSCRIBE_PR_TOOL_NAME = 'subscribe_pr_activity'

const inputSchema = lazySchema(() =>
  z.strictObject({
    owner: z.string().describe('Repository owner (user or organization)'),
    repo: z.string().describe('Repository name'),
    pull_number: z.number().int().positive().describe('Pull request number'),
  }),
)

const outputSchema = lazySchema(() =>
  z.object({
    subscribed: z.boolean().describe('Whether subscription was successful'),
    pr_url: z.string().describe('URL of the subscribed pull request'),
    message: z.string().describe('Status message'),
  }),
)

// Track active subscriptions
const _subscriptions = new Map<string, { owner: string; repo: string; pull_number: number }>()

export const SubscribePRTool = buildTool({
  name: SUBSCRIBE_PR_TOOL_NAME,
  aliases: ['subscribe_pr'],

  async description() {
    return 'Subscribe to GitHub pull request activity (comments, CI, reviews)'
  },

  async prompt() {
    return `Subscribe to receive real-time activity from a GitHub pull request.

Once subscribed, you will receive <github-webhook-activity> messages containing:
- New review comments and reviews
- CI/check status updates (pass/fail)
- Push events (new commits)
- PR state changes (merged, closed, etc.)

Use this when:
- You've created a PR and want to monitor CI results
- The user asks you to watch a PR for review comments
- You need to respond to reviewer feedback automatically

Events arrive as user messages. Investigate each to decide if action is needed.

Note: Merge conflict transitions do NOT arrive via webhook — GitHub doesn't push mergeable_state changes. If you need to check merge status, use the GitHub MCP tools directly.`
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

  async call({ owner, repo, pull_number }) {
    const key = `${owner}/${repo}#${pull_number}`
    const prUrl = `https://github.com/${owner}/${repo}/pull/${pull_number}`

    // Register subscription
    _subscriptions.set(key, { owner, repo, pull_number })

    // In full implementation, this would register with the bridge/MCP
    // infrastructure to receive webhook events. For now, we register
    // the subscription locally and the bridge handler picks it up.

    return {
      data: {
        subscribed: true,
        pr_url: prUrl,
        message: `Subscribed to ${key}. You will receive webhook events as <github-webhook-activity> messages.`,
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
      `🔔 Subscribe to ${input.owner}/${input.repo}#${input.pull_number}`)
  },
})

/**
 * Get all active PR subscriptions (used by bridge webhook handler).
 */
export function getActiveSubscriptions(): Map<string, { owner: string; repo: string; pull_number: number }> {
  return _subscriptions
}

/**
 * Remove a PR subscription.
 */
export function unsubscribePR(owner: string, repo: string, pull_number: number): boolean {
  return _subscriptions.delete(`${owner}/${repo}#${pull_number}`)
}
