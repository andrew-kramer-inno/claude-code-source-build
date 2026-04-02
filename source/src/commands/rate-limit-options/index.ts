import type { Command } from '../../commands.js'
import { isClaudeAISubscriber } from '../../utils/auth.js'

const rateLimitOptions = {
  type: 'local-jsx',
  name: 'rate-limit-options',
  description: 'Show options when rate limit is reached',
  // [MOD] Always enabled + unhidden
  isEnabled: () => true,
  isHidden: false,
  load: () => import('./rate-limit-options.js'),
} satisfies Command

export default rateLimitOptions
