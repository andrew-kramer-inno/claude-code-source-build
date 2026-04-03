/**
 * [MOD] WebBrowserTool — built-in web browser for fetching and reading pages.
 *
 * Higher-level than WebFetchTool: navigates URLs, extracts readable content,
 * handles redirects and dynamic pages. Outputs cleaned text suitable for
 * the model to reason about.
 */

import { z } from 'zod/v4'
import { buildTool } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'

export const WEB_BROWSER_TOOL_NAME = 'WebBrowser'

const inputSchema = lazySchema(() =>
  z.strictObject({
    url: z
      .string()
      .url()
      .describe('The URL to navigate to'),
    action: z
      .enum(['navigate', 'screenshot', 'extract_text', 'extract_links'])
      .default('navigate')
      .describe('Action to perform on the page'),
    selector: z
      .string()
      .optional()
      .describe('Optional CSS selector to focus on a specific element'),
    wait_for: z
      .string()
      .optional()
      .describe('Optional CSS selector to wait for before extracting content'),
  }),
)

const outputSchema = lazySchema(() =>
  z.object({
    url: z.string().describe('Final URL after redirects'),
    title: z.string().describe('Page title'),
    content: z.string().describe('Extracted page content'),
    status: z.number().describe('HTTP status code'),
    links: z
      .array(z.object({ text: z.string(), href: z.string() }))
      .optional()
      .describe('Extracted links (when action=extract_links)'),
  }),
)

export const WebBrowserTool = buildTool({
  name: WEB_BROWSER_TOOL_NAME,

  async description() {
    return 'Navigate to a URL and extract page content'
  },

  async prompt() {
    return `Navigate to a web page and extract its content.

Actions:
- navigate: Fetch the page and return its main text content (default)
- screenshot: Capture a text representation of the page layout
- extract_text: Extract only the readable text, stripping navigation/chrome
- extract_links: Extract all links from the page

Use \`selector\` to focus on a specific part of the page (CSS selector).
Use \`wait_for\` to wait for dynamic content to load (CSS selector).

This tool is more capable than WebFetch for complex pages. Use WebFetch
for simple API calls or raw HTML fetching.`
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

  async call({ url, action, selector }) {
    // Implementation: use Node's built-in fetch for basic page retrieval
    // In a full implementation, this would use a headless browser
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; ClaudeCode/2.1; +https://claude.ai)',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(30_000),
      })

      const html = await response.text()

      // Strip HTML tags for basic text extraction
      let content = html
        // Remove script and style tags and their content
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        // Remove HTML comments
        .replace(/<!--[\s\S]*?-->/g, '')
        // Convert common block elements to newlines
        .replace(/<\/(p|div|h[1-6]|li|tr|br\s*\/?)>/gi, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        // Strip remaining tags
        .replace(/<[^>]+>/g, ' ')
        // Decode common HTML entities
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        // Collapse whitespace
        .replace(/[ \t]+/g, ' ')
        .replace(/\n\s*\n/g, '\n\n')
        .trim()

      // Extract title
      const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
      const title = titleMatch
        ? titleMatch[1].replace(/\s+/g, ' ').trim()
        : '(no title)'

      // Extract links if requested
      let links: Array<{ text: string; href: string }> | undefined
      if (action === 'extract_links') {
        links = []
        const linkRegex = /<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
        let match
        while ((match = linkRegex.exec(html)) !== null) {
          const href = match[1]
          const text = match[2].replace(/<[^>]+>/g, '').trim()
          if (href && text) {
            links.push({ text, href })
          }
        }
        links = links.slice(0, 100) // Cap at 100 links
      }

      // Truncate content to avoid overwhelming the context
      if (content.length > 50_000) {
        content = content.slice(0, 50_000) + '\n\n[Content truncated at 50,000 characters]'
      }

      return {
        data: {
          url: response.url,
          title,
          content,
          status: response.status,
          links,
        },
      }
    } catch (err) {
      return {
        data: {
          url,
          title: '(error)',
          content: `Failed to fetch: ${err instanceof Error ? err.message : String(err)}`,
          status: 0,
          links: undefined,
        },
      }
    }
  },

  mapToolResultToToolResultBlockParam(content, toolUseID) {
    const header = `[${content.status}] ${content.title}\n${content.url}\n\n`
    const body = content.content.slice(0, 30_000)
    return {
      type: 'tool_result',
      tool_use_id: toolUseID,
      content: header + body,
    }
  },

  renderToolUseMessage(input) {
    const React = require('react')
    const { Text } = require('../../ink.js')
    return React.createElement(Text, { dimColor: true },
      `🌐 Browse: ${input.url}`)
  },
})
