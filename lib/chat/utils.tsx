import 'server-only'

import { createStreamableUI, createStreamableValue } from 'ai/rsc'
import { nanoid } from '@/lib/utils'
import { SpinnerMessage } from '@/components/stocks/message'
import type { MutableAIState, Message, AIState } from './types'

export const createStreams = () =>
  ({
    text: createStreamableValue(''),
    spinner: createStreamableUI(<SpinnerMessage />),
    message: createStreamableUI(null),
    ui: createStreamableUI()
  }) as const

export const closeStreams = (
  streams: ReturnType<typeof createStreams>,
  error?: Error
) => {
  if (error) {
    streams.ui.error(error)
    streams.text.error(error)
    streams.message.error(error)
    streams.spinner.done(null)
    return
  }

  streams.ui.done()
  streams.text.done()
  streams.message.done()
  streams.spinner.done(null)
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
