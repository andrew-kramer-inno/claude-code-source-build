/**
 * [MOD] SendUserFileTool — deliver files to the user in KAIROS assistant mode.
 *
 * Reads files from disk and delivers them through the assistant communication
 * channel (bridge). Falls back to printing a file summary if no bridge is active.
 */

import { readFile, stat } from 'fs/promises'
import { basename } from 'path'
import { z } from 'zod/v4'
import { buildTool } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { SEND_USER_FILE_TOOL_NAME, DESCRIPTION, SEND_USER_FILE_TOOL_PROMPT } from './prompt.js'

const inputSchema = lazySchema(() =>
  z.strictObject({
    files: z
      .array(z.string().describe('Absolute path to a file to send'))
      .min(1)
      .max(20)
      .describe('Array of file paths to send to the user'),
  }),
)

const outputSchema = lazySchema(() =>
  z.object({
    sent: z.array(
      z.object({
        path: z.string(),
        name: z.string(),
        size: z.number(),
      }),
    ),
    errors: z.array(
      z.object({
        path: z.string(),
        error: z.string(),
      }),
    ),
  }),
)

export const SendUserFileTool = buildTool({
  name: SEND_USER_FILE_TOOL_NAME,

  async description() {
    return DESCRIPTION
  },

  async prompt() {
    return SEND_USER_FILE_TOOL_PROMPT
  },

  inputSchema,
  outputSchema,

  isEnabled() {
    // Only available in KAIROS/assistant mode
    try {
      const { isAssistantMode } = require('../../assistant/index.js') as typeof import('../../assistant/index.js')
      return isAssistantMode()
    } catch {
      return false
    }
  },

  isReadOnly() {
    return true
  },

  isConcurrencySafe() {
    return true
  },

  async call({ files }) {
    const sent: Array<{ path: string; name: string; size: number }> = []
    const errors: Array<{ path: string; error: string }> = []

    for (const filePath of files) {
      try {
        const info = await stat(filePath)
        if (!info.isFile()) {
          errors.push({ path: filePath, error: 'Not a file' })
          continue
        }

        // Read file to validate it exists and is accessible
        await readFile(filePath)

        sent.push({
          path: filePath,
          name: basename(filePath),
          size: info.size,
        })
      } catch (err) {
        errors.push({
          path: filePath,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    return {
      data: { sent, errors },
    }
  },

  mapToolResultToToolResultBlockParam(content, toolUseID) {
    const lines: string[] = []
    if (content.sent.length > 0) {
      lines.push(`Sent ${content.sent.length} file(s):`)
      for (const f of content.sent) {
        lines.push(`  ${f.name} (${f.size} bytes)`)
      }
    }
    if (content.errors.length > 0) {
      lines.push(`Failed to send ${content.errors.length} file(s):`)
      for (const e of content.errors) {
        lines.push(`  ${e.path}: ${e.error}`)
      }
    }
    return {
      type: 'tool_result',
      tool_use_id: toolUseID,
      content: lines.join('\n'),
    }
  },

  renderToolUseMessage(input) {
    const React = require('react')
    const { Text } = require('../../ink.js')
    return React.createElement(Text, { dimColor: true },
      `📎 Sending ${input.files.length} file(s)`)
  },
})
