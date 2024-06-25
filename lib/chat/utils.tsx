import 'server-only'

import { createStreamableUI, createStreamableValue } from 'ai/rsc'
import { nanoid } from '@/lib/utils'
import { SpinnerMessage } from '@/components/stocks/message'
import type { MutableAIState, Message, AIState } from './types'

export const createStreams = () =>
  ({
    textStream: createStreamableValue(''),
    spinnerStream: createStreamableUI(<SpinnerMessage />),
    messageStream: createStreamableUI(null),
    uiStream: createStreamableUI()
  }) as const

export const appendMessageToAIState = (
  aiState: MutableAIState<AIState>,
  newMessage: Message
) =>
  aiState.update({
    ...aiState.get(),
    messages: [
      ...aiState.get().messages,
      {
        id: nanoid(),
        ...newMessage
      }
    ]
  })
