/**
 * [MOD] Assistant module — KAIROS daemon mode entrypoint.
 *
 * Provides the core assistant-mode lifecycle: forced latch for Agent SDK
 * daemon launches, team pre-seeding, system prompt addendum, and activation
 * path for telemetry.
 */

// ── Internal state ──────────────────────────────────────────────────────

let _forced = false
let _active = false

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Mark assistant mode as forced (called when --assistant CLI flag is passed).
 * Agent SDK daemon has already verified entitlement — skip GrowthBook gate.
 */
export function markAssistantForced(): void {
  _forced = true
  _active = true
}

/**
 * Whether markAssistantForced() has been called this session.
 */
export function isAssistantForced(): boolean {
  return _forced
}

/**
 * Whether assistant/KAIROS mode is currently active.
 * True if forced via --assistant flag or activated via GrowthBook gate.
 */
export function isAssistantMode(): boolean {
  return _active
}

/**
 * Activate assistant mode (called after GrowthBook gate passes).
 */
export function setAssistantActive(active: boolean): void {
  _active = active
}

/**
 * Pre-seed the in-process team context for assistant mode.
 * Returns the team context to inject into AppState, or undefined if
 * no team should be initialized (e.g., spawned teammate via --agent-id).
 */
export async function initializeAssistantTeam(): Promise<
  | {
      teamName: string
      teamFilePath: string
      leadAgentId: string
      selfAgentId?: string
      selfAgentName?: string
      isLeader?: boolean
      selfAgentColor?: string
      teammates: Record<string, unknown>
    }
  | undefined
> {
  // In a full implementation this would load team config from
  // .claude/agents/assistant.md and pre-seed teammate slots.
  // For now, return undefined — teams initialize on demand via TeamCreateTool.
  return undefined
}

/**
 * Returns the system prompt addendum for assistant/KAIROS mode.
 * Appended after the main system prompt when kairosEnabled=true.
 */
export function getAssistantSystemPromptAddendum(): string {
  return [
    '# Assistant Mode (KAIROS)',
    '',
    'You are running in persistent assistant mode. You have access to:',
    '- Sleep tool: Use to wait between tasks (prefer over Bash sleep)',
    '- Brief tool: Use SendUserMessage to deliver updates to the user',
    '- Push notifications: Alert the user when tasks complete',
    '- Proactive ticking: You will receive periodic <tick> prompts',
    '',
    'When you have no immediate work:',
    '1. Check for pending tasks or scheduled work',
    '2. Use Sleep to wait for the next tick or user input',
    '3. Never exit — you are a persistent daemon',
    '',
    'You MUST use SendUserMessage for all user-facing communication.',
    'Do not output raw text — it may not be visible to the user.',
  ].join('\n')
}

/**
 * Returns the activation path for telemetry/debugging.
 * Typically the path to .claude/agents/assistant.md or similar.
 */
export function getAssistantActivationPath(): string | undefined {
  return process.env.CLAUDE_ASSISTANT_DEFINITION_PATH ?? undefined
}
