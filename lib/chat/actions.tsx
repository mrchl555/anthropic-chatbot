import 'server-only'

import {
  createAI,
  createStreamableUI,
  getMutableAIState,
  getAIState,
  createStreamableValue
} from 'ai/rsc'
import { BotCard, BotMessage } from '@/components/stocks'
import { nanoid, sleep } from '@/lib/utils'
import { saveChat } from '@/app/actions'
import { UserMessage } from '@/components/stocks/message'
import { Chat } from '../types'
import { auth } from '@/auth'
import { PurchaseTickets } from '@/components/flights/purchase-ticket'
import { CheckIcon, SpinnerIcon } from '@/components/ui/icons'
import { Video } from '@/components/media/video'
import { rateLimit } from './ratelimit'
import * as prompts from './prompts'
import * as tools from './tools'
import AIService from './service'
import type { AIState, UIState, AIProvider } from './types'

async function describeImage(imageBase64: string) {
  'use server'

  await rateLimit()

  const service: AIService = new AIService(getMutableAIState<AIProvider>())

  service.streams.ui.update(
    <BotCard>
      <Video isLoading />
    </BotCard>
  )
  ;(async () => {
    try {
      // attachment as video for demo purposes,
      // add your implementation here to support
      // video as input for prompts.
      if (imageBase64 === '') {
        throw new Error(`implement video`)
      } else {
        const [header, imageData] = imageBase64.split(',')

        const result = await service.initiateStreamText(
          prompts.describeImage(
            imageData,
            header.replace('data:', '').split(';')[0]
          )
        )

        await service.handleTextStream(result, content => {
          if (!content) {
            return
          }

          service.appendMessage({
            role: 'user',
            content: 'Describe the attached image.'
          })

          service.appendMessage({
            role: 'assistant',
            content
          })
        })
      }

      service.streams.ui.update(
        <BotCard>
          <Video />
        </BotCard>
      )
    } catch (e) {
      console.error(e)

      service.close(e as Error)
      return
    }

    service.close()
  })()

  return {
    id: nanoid(),
    attachments: service.streams.ui.value,
    spinner: service.streams.spinner.value,
    display: service.streams.message.value
  }
}

async function submitUserMessage(content: string) {
  'use server'

  await rateLimit()

  const service: AIService = new AIService(getMutableAIState<AIProvider>())

  service.appendMessage({
    role: 'user',
    content
  })

  // Intentionally not awaiting this:
  service.processAIState(prompts.shoppingAssistant)

  return {
    id: nanoid(),
    attachments: service.streams.ui.value,
    spinner: service.streams.spinner.value,
    display: service.streams.message.value
  }
}

export async function requestCode() {
  'use server'

  const aiState = getMutableAIState<AIProvider>()

  aiState.done({
    ...aiState.get(),
    messages: [
      ...aiState.get().messages,
      {
        role: 'assistant',
        content:
          "A code has been sent to user's phone. They should enter it in the user interface to continue."
      }
    ]
  })

  const ui = createStreamableUI(
    <div className="animate-spin">
      <SpinnerIcon />
    </div>
  )

  ;(async () => {
    await sleep(2000)
    ui.done()
  })()

  return {
    status: 'requires_code',
    display: ui.value
  }
}

export async function validateCode() {
  'use server'

  const aiState = getMutableAIState<AIProvider>()

  const status = createStreamableValue('in_progress')
  const ui = createStreamableUI(
    <div className="flex flex-col items-center justify-center gap-3 p-6 text-zinc-500">
      <div className="animate-spin">
        <SpinnerIcon />
      </div>
      <div className="text-sm text-zinc-500">
        Please wait while we fulfill your order.
      </div>
    </div>
  )

  ;(async () => {
    await sleep(2000)

    ui.done(
      <div className="flex flex-col items-center text-center justify-center gap-3 p-4 text-emerald-700">
        <CheckIcon />
        <div>Payment Succeeded</div>
        <div className="text-sm text-zinc-600">
          Thanks for your purchase! You will receive an email confirmation
          shortly.
        </div>
      </div>
    )

    aiState.done({
      ...aiState.get(),
      messages: [
        ...aiState.get().messages.slice(0, -1),
        {
          role: 'assistant',
          content: 'The purchase has completed successfully.'
        }
      ]
    })

    status.done('completed')
  })()

  return {
    status: status.value,
    display: ui.value
  }
}

const actions = {
  submitUserMessage,
  requestCode,
  validateCode,
  describeImage
} as const

export const AI = createAI<AIState, UIState, typeof actions>({
  actions,
  initialUIState: [],
  initialAIState: { chatId: nanoid(), messages: [] },
  onGetUIState: async () => {
    'use server'

    const session = await auth()

    if (session && session.user) {
      const aiState = getAIState<AIProvider>()

      if (aiState) {
        const uiState = getUIStateFromAIState(aiState)
        return uiState
      }
    } else {
      return
    }
  },
  onSetAIState: async ({ state }) => {
    'use server'

    const session = await auth()

    if (session && session.user) {
      const { chatId, messages } = state

      const createdAt = new Date()
      const userId = session.user.id as string
      const path = `/chat/${chatId}`
      const title = messages[0].content.substring(0, 100)

      const chat: Chat = {
        id: chatId,
        title,
        userId,
        createdAt,
        messages,
        path
      }

      await saveChat(chat)
    } else {
      return
    }
  }
})

export const getUIStateFromAIState = (aiState: Chat) => {
  return aiState.messages
    .filter(message => message.role !== 'system')
    .map((message, index) => ({
      id: `${aiState.chatId}-${index}`,
      display:
        message.role === 'assistant' ? (
          tools[message.display?.name as string] !== undefined ? (
            tools[message.display?.name as keyof typeof tools].UIFromAI(
              message.display.props
            )
          ) : message.content === 'The purchase has completed successfully.' ? (
            <BotCard>
              <PurchaseTickets status="expired" />
            </BotCard>
          ) : (
            <BotMessage content={message.content} />
          )
        ) : message.role === 'user' ? (
          <UserMessage showAvatar>{message.content}</UserMessage>
        ) : (
          <BotMessage content={message.content} />
        )
    }))
}
