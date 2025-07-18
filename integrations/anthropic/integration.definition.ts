/* bplint-disable */
import { z, IntegrationDefinition } from '@botpress/sdk'
import { ModelId } from 'src/schemas'
import llm from './bp_modules/llm'

export default new IntegrationDefinition({
  name: 'anthropic',
  title: 'Anthropic',
  description: 'Access a curated list of Claude models to set as your chosen LLM.',
  version: '10.0.0',
  readme: 'hub.md',
  icon: 'icon.svg',
  entities: {
    modelRef: {
      schema: z.object({
        id: ModelId,
      }),
    },
  },
  secrets: {
    ANTHROPIC_API_KEY: {
      description: 'Anthropic API key',
    },
  },
}).extend(llm, ({ entities }) => ({
  entities: { modelRef: entities.modelRef },
}))
