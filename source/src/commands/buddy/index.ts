import type { Command } from '../../commands.js'

const buddy = {
  type: 'local',
  name: 'buddy',
  description: 'Hatch, view, pet, or manage your coding companion',
  argumentHint: '[pet | stats | mute | unmute | reroll]',
  aliases: ['companion', 'pet'],
  supportsNonInteractive: false,
  load: () => import('./buddy.js'),
} satisfies Command

export default buddy
