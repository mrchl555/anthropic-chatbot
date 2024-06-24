import 'server-only'

import { z } from 'zod'
import type { Message } from 'ai'
import { nanoid } from '@/lib/utils'
import { BotCard, BotMessage } from '@/components/stocks'
import { ListFlights } from '@/components/flights/list-flights'
import {
  createStreamableUI,
  getMutableAIState,
} from 'ai/rsc'

export type ToolParameters = z.input<typeof definition.parameters>
export type ToolProps = {
  summary: ToolParameters
}

export const definition = {
  description:
    "List available flights in the UI. List 3 that match user's query.",
  parameters: z.object({
    departingCity: z.string(),
    arrivalCity: z.string(),
    departingAirport: z.string().describe('Departing airport code'),
    arrivalAirport: z.string().describe('Arrival airport code'),
    date: z
      .string()
      .describe("Date of the user's flight, example format: 6 April, 1998")
  })
}

export const call = (
  args: ToolParameters,
  aiState: ReturnType<typeof getMutableAIState>,
  uiStream: ReturnType<typeof createStreamableUI>
) => {
  debugger

  const props: ToolProps = {
    summary: args
  }

  aiState.done({
    ...aiState.get(),
    interactions: [],
    messages: [
      ...aiState.get().messages,
      {
        id: nanoid(),
        role: 'assistant',
        content:
          "Here's a list of flights for you. Choose one and we can proceed to pick a seat.",
        display: {
          name: 'showFlights',
          props
        }
      }
    ]
  })

  uiStream.update(UIFromAI(props))
}

export const UIFromAI = (args: ToolProps) => (
  <BotCard>
    <ListFlights {...args} />
  </BotCard>
)
