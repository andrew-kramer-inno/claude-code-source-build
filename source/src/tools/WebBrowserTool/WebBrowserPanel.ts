/**
 * [MOD] WebBrowserPanel — UI panel component for the web browser tool.
 *
 * Rendered conditionally in REPL.tsx when WEB_BROWSER_TOOL feature flag
 * is enabled. Provides a visual panel for web browser state.
 */

import * as React from 'react'

/**
 * Web browser panel component. In a full implementation, this would show
 * the browser state (current URL, loading status, rendered page preview).
 * For now, it's a no-op placeholder that satisfies the import contract.
 */
export function WebBrowserPanel(): React.ReactNode {
  // The panel only renders when there's active browser state.
  // Since our WebBrowserTool is stateless (fetch-based), the panel
  // is a no-op. A full Puppeteer/Playwright implementation would
  // maintain browser state and render it here.
  return null
}
