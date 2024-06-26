import 'server-only'

import { z } from 'zod'
import { tool } from 'ai'
import { nanoid } from '@/lib/utils'
import { BotCard, BotMessage } from '@/components/stocks'
import {
  PurchaseTickets,
  PurchaseProps
} from '@/components/flights/purchase-ticket'
import { createStreamableUI } from 'ai/rsc'
import type { MutableAIState } from '../types'

export type ToolParameters = z.input<typeof definition.parameters>
export type ToolProps = any

export const definition = tool({
  description: 'Show the UI to purchase/checkout a flight and hotel booking.',
  parameters: z.object({})
})

export const call = (
  args: ToolParameters,
  aiState: MutableAIState,
  uiStream: ReturnType<typeof createStreamableUI>
) => {
  aiState.done({
    ...aiState.get(),
    interactions: []
  })

  uiStream.update(UIFromAI())
}

export const UIFromAI = (props?: PurchaseProps) => (
  <BotCard>
    <PurchaseTickets {...props} />
  </BotCard>
)
