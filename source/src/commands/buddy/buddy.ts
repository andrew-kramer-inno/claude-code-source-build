import type { LocalCommandCall } from '../../types/command.js'
import {
  companionUserId,
  getCompanion,
  roll,
  rollWithSeed,
} from '../../buddy/companion.js'
import { renderSprite, renderFace } from '../../buddy/sprites.js'
import {
  RARITY_STARS,
  STAT_NAMES,
  type Companion,
  type CompanionBones,
  type Roll,
} from '../../buddy/types.js'
import {
  getGlobalConfig,
  saveGlobalConfig,
} from '../../utils/config.js'

function formatStats(bones: CompanionBones): string {
  return STAT_NAMES.map(
    s => `  ${s.padEnd(10)} ${'█'.repeat(Math.round(bones.stats[s] / 5))} ${bones.stats[s]}`,
  ).join('\n')
}

function formatCompanion(companion: Companion): string {
  const sprite = renderSprite(companion, 0)
  const face = renderFace(companion)
  const stars = RARITY_STARS[companion.rarity]
  const shiny = companion.shiny ? ' ✨ SHINY!' : ''

  return [
    '',
    sprite.join('\n'),
    '',
    `  ${face}  ${companion.name}`,
    `  ${companion.rarity.toUpperCase()} ${stars}${shiny}`,
    `  Species: ${companion.species}`,
    `  Eye: ${companion.eye}  Hat: ${companion.hat}`,
    `  Personality: ${companion.personality}`,
    '',
    '  ── Stats ──',
    formatStats(companion),
    '',
  ].join('\n')
}

function formatRoll(r: Roll): string {
  const sprite = renderSprite(r.bones, 0)
  const stars = RARITY_STARS[r.bones.rarity]
  const shiny = r.bones.shiny ? ' ✨ SHINY!' : ''

  return [
    '',
    sprite.join('\n'),
    '',
    `  ${r.bones.rarity.toUpperCase()} ${stars}${shiny}`,
    `  Species: ${r.bones.species}`,
    `  Eye: ${r.bones.eye}  Hat: ${r.bones.hat}`,
    '',
    '  ── Stats ──',
    formatStats(r.bones),
    '',
    '  Name this companion by chatting: "Name my buddy [name]"',
    '  The model will generate a personality and hatch it.',
    '',
  ].join('\n')
}

export const call: LocalCommandCall = async (args) => {
  const sub = args.trim().toLowerCase()

  // ── /buddy pet ──
  if (sub === 'pet') {
    const companion = getCompanion()
    if (!companion) {
      return { type: 'text', value: 'You don\'t have a companion yet! Run /buddy to see your egg.' }
    }
    // Set pet timestamp in app state (the CompanionSprite reads companionPetAt)
    return {
      type: 'text',
      value: `You pet ${companion.name} the ${companion.species}! ${renderFace(companion)} ❤️`,
    }
  }

  // ── /buddy stats ──
  if (sub === 'stats') {
    const companion = getCompanion()
    if (!companion) {
      return { type: 'text', value: 'No companion hatched yet. Run /buddy first.' }
    }
    return { type: 'text', value: formatCompanion(companion) }
  }

  // ── /buddy mute ──
  if (sub === 'mute') {
    saveGlobalConfig(c => ({ ...c, companionMuted: true }))
    const companion = getCompanion()
    const name = companion?.name ?? 'Companion'
    return { type: 'text', value: `${name} has been muted. They'll stay quiet but still be there. /buddy unmute to bring them back.` }
  }

  // ── /buddy unmute ──
  if (sub === 'unmute') {
    saveGlobalConfig(c => ({ ...c, companionMuted: false }))
    const companion = getCompanion()
    const name = companion?.name ?? 'Companion'
    return { type: 'text', value: `${name} is back! 🎉` }
  }

  // ── /buddy reroll ──
  if (sub === 'reroll') {
    // Reroll with a random seed instead of userId — lets you pick a new companion
    const seed = `reroll-${Date.now()}-${Math.random()}`
    const r = rollWithSeed(seed)
    // Store the seed so future rolls use it
    saveGlobalConfig(c => ({ ...c, companionSeed: seed, companion: undefined }))
    return {
      type: 'text',
      value: `🥚 New egg rolled!\n${formatRoll(r)}\nChat to hatch: "Name my buddy [name] with personality [trait]"`,
    }
  }

  // ── /buddy hatch <name> [personality] ──
  if (sub.startsWith('hatch ')) {
    const rest = args.trim().slice(6).trim()
    const parts = rest.split(/\s+/)
    const name = parts[0]
    const personality = parts.slice(1).join(' ') || 'cheerful and curious'

    if (!name) {
      return { type: 'text', value: 'Usage: /buddy hatch <name> [personality description]' }
    }

    saveGlobalConfig(c => ({
      ...c,
      companion: {
        name,
        personality,
        hatchedAt: Date.now(),
      },
    }))

    const companion = getCompanion()
    if (!companion) {
      return { type: 'text', value: 'Something went wrong hatching your companion.' }
    }

    return {
      type: 'text',
      value: `🐣 ${name} has hatched!\n${formatCompanion(companion)}`,
    }
  }

  // ── /buddy (default — show companion or egg) ──
  const companion = getCompanion()
  if (companion) {
    return { type: 'text', value: formatCompanion(companion) }
  }

  // No companion yet — show the egg (deterministic roll from userId)
  const userId = companionUserId()
  const r = roll(userId)
  return {
    type: 'text',
    value: `🥚 You have an unhatched egg!\n${formatRoll(r)}\nHatch it: /buddy hatch <name> [personality]\nOr reroll: /buddy reroll`,
  }
}
