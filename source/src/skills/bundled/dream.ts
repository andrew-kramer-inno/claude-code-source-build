/**
 * [MOD] Dream skill — memory consolidation for KAIROS mode.
 *
 * The /dream command triggers memory consolidation: reviewing recent sessions
 * and extracting key learnings into persistent memory files.
 */

import { registerBundledSkill } from '../bundledSkills.js'

const DREAM_PROMPT = `# Dream: Memory Consolidation

Review recent session history and consolidate learnings into persistent memory.

## Phase 1: Gather Context

1. Read the current memory files (CLAUDE.md, .claude/memory/ if it exists)
2. Review the conversation history from this and recent sessions
3. Identify patterns, preferences, and learnings that should be remembered

## Phase 2: Consolidate

For each significant learning:
1. Check if it's already captured in memory
2. If new, add it to the appropriate memory file
3. If outdated, update the existing entry
4. Remove stale entries that no longer apply

## Phase 3: Organize

Ensure memory files are well-organized:
- Group related items together
- Remove duplicates
- Keep entries concise and actionable
- Prioritize information that affects future coding decisions

## Guidelines

- Focus on: code patterns, user preferences, project conventions, common pitfalls
- Skip: one-off fixes, temporary workarounds, context-specific details
- Keep total memory under 2000 lines across all files
- Write entries as directives: "Always X", "Prefer Y over Z", "When doing X, remember Y"`

export function registerDreamSkill(): void {
  registerBundledSkill({
    name: 'dream',
    description:
      'Consolidate learnings from recent sessions into persistent memory',
    userInvocable: true,
    async getPromptForCommand(args) {
      let prompt = DREAM_PROMPT
      if (args) {
        prompt += `\n\n## Focus Area\n\n${args}`
      }
      return [{ type: 'text', text: prompt }]
    },
  })
}
