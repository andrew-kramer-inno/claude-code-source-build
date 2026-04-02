import type { Command } from '../../commands.js'

const dumpInfo = {
  type: 'local',
  name: 'dump-info',
  description: 'Dump system prompt, API endpoints, feature flags, and internal state',
  argumentHint: '[prompt | endpoints | flags | config | coordinator]',
  aliases: ['internals', 'debug-dump'],
  supportsNonInteractive: true,
  load: () => import('./dump-info.js'),
} satisfies Command

export default dumpInfo
