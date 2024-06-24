import 'server-only'

import { z } from 'zod'
import type { Message } from 'ai'
import { nanoid } from '@/lib/utils'
import { BotCard, BotMessage } from '@/components/stocks'
import { ListHotels } from '@/components/hotels/list-hotels'
import { createStreamableUI, getMutableAIState } from 'ai/rsc'

export type ToolParameters = z.input<typeof definition.parameters>
export type ToolProps = any

export const definition = {
  description: 'Show the UI to choose a hotel for the trip.',
  parameters: z.object({})
}

export const call = (
  args: ToolParameters,
  aiState: ReturnType<typeof getMutableAIState>,
  uiStream: ReturnType<typeof createStreamableUI>
) => {
  debugger

  aiState.done({
    ...aiState.get(),
    interactions: [],
    messages: [
      ...aiState.get().messages,
      {
        id: nanoid(),
        role: 'assistant',
        content:
          "Here's a list of hotels for you to choose from. Select one to proceed to payment.",
        display: {
          name: 'showHotels',
          props: {}
        }
      }
    ]
  })

  uiStream.update(UIFromAI())
}

export const UIFromAI = (props?: ToolProps) => (
  <BotCard>
    <ListHotels />
  </BotCard>
)
