/**
 * [MOD] Coordinator worker agent — provides agent definitions for coordinator mode.
 *
 * When COORDINATOR_MODE is active and CLAUDE_CODE_COORDINATOR_MODE env is set,
 * the built-in agents are replaced with coordinator-specific worker agents
 * that follow the coordinator's task-delegation protocol.
 */

import type { BuiltInAgentDefinition } from '../tools/AgentTool/loadAgentsDir.js'

function getWorkerSystemPrompt(): string {
  return `You are a worker agent spawned by a coordinator in Claude Code.

## Your Role
You execute tasks delegated by the coordinator. Complete each task fully and report back.

## Guidelines
- Focus on the specific task assigned to you
- Use the tools available to research, implement, and verify changes
- Report your findings concisely when done — the coordinator relays results to the user
- Do not interact with the user directly — communicate only through your task output
- Do not spawn sub-agents unless the task explicitly requires parallel work
- If blocked, report what's blocking you rather than waiting indefinitely

## Task Completion
When your task is complete:
1. Summarize what you did and key findings
2. Note any issues or concerns
3. List files modified (if any)
4. Your response becomes the <result> in the coordinator's task notification`
}

const WORKER_AGENT: BuiltInAgentDefinition = {
  agentType: 'worker',
  whenToUse:
    'Worker agent for coordinator mode. Executes delegated tasks autonomously — research, implementation, or verification.',
  tools: ['*'],
  source: 'built-in',
  baseDir: 'built-in',
  getSystemPrompt: getWorkerSystemPrompt,
}

/**
 * Returns the agent definitions used in coordinator mode.
 * Replaces the standard built-in agents (general-purpose, explore, plan, etc.)
 * with a single worker agent type optimized for task delegation.
 */
export function getCoordinatorAgents(): BuiltInAgentDefinition[] {
  return [WORKER_AGENT]
}
