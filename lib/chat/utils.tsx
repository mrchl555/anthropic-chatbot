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

export const closeStreams = (
  streams: ReturnType<typeof createStreams>,
  error?: Error
) => {
  if (error) {
    streams.uiStream.error(error)
    streams.textStream.error(error)
    streams.messageStream.error(error)
    streams.spinnerStream.done(null)
    return
  }

  streams.uiStream.done()
  streams.textStream.done()
  streams.messageStream.done()
  streams.spinnerStream.done(null)
}

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
