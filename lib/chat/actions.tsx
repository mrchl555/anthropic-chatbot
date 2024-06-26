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
import {
  SpinnerMessage,
  UserMessage,
  SystemMessage
} from '@/components/stocks/message'
import { Chat } from '../types'
import { auth } from '@/auth'
import { PurchaseTickets } from '@/components/flights/purchase-ticket'
import { CheckIcon, SpinnerIcon } from '@/components/ui/icons'
import { format } from 'date-fns'
import { streamText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { Video } from '@/components/media/video'
import { rateLimit } from './ratelimit'
import * as tools from './tools'
import { appendMessageToAIState, createStreams } from './utils'
import type { MutableAIState, AIState, UIState, AIProvider } from './types'

const model = anthropic('claude-3-haiku-20240307')

async function describeImage(imageBase64: string) {
  'use server'

  await rateLimit()

  const aiState = getMutableAIState<AIProvider>()
  const streams = createStreams()

  streams.uiStream.update(
    <BotCard>
      <Video isLoading />
    </BotCard>
  )
  ;(async () => {
    try {
      let text = ''

      // attachment as video for demo purposes,
      // add your implementation here to support
      // video as input for prompts.
      if (imageBase64 === '') {
        throw new Error(`implement video`)
      } else {
        const [header, imageData] = imageBase64.split(',')

        const result = await streamText({
          model,
          temperature: 0,
          tools: Object.fromEntries(
            Object.entries(tools).map(([k, v]) => [k, v.definition])
          ),
          messages: [
            {
              role: 'system',
              content: 'List the books in this image.'
            },
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  image: imageData,
                  mimeType: header.split(';')[0].replace('data:', '')
                }
              ]
            }
          ]
        })

        await handleLLMStream(result, aiState, streams)
      }

      streams.spinnerStream.done(null)
      streams.messageStream.done(null)

      streams.uiStream.done(
        <BotCard>
          <Video />
        </BotCard>
      )

      aiState.done({
        ...aiState.get(),
        interactions: [text]
      })
    } catch (e) {
      console.error(e)

      streams.uiStream.error(e)
      streams.spinnerStream.error(e)
      streams.messageStream.error(e)
      aiState.done()
    }
  })()

  return {
    id: nanoid(),
    attachments: streams.uiStream.value,
    spinner: streams.spinnerStream.value,
    display: streams.messageStream.value
  }
}

const processAIState = async (
  aiState: MutableAIState<AIState>,
  streams: ReturnType<typeof createStreams>
) => {
  let closed = false
  try {
    await processLLMRequest(aiState, streams)
  } catch (error) {
    console.error('Error in LLM request:', error)

    // Inform the user about the error
    streams.uiStream.update(
      <>
        <SystemMessage>
          Please, allow me just one more second while I try again...
        </SystemMessage>
        <SpinnerMessage />
      </>
    )

    // Retry the LLM request with error information
    try {
      await processLLMRequest(aiState, streams, error as Error)
    } catch (retryError) {
      console.error('Error in retry attempt:', retryError)
      streams.uiStream.error(retryError)
      streams.textStream.error(retryError)
      streams.messageStream.error(retryError)
      streams.spinnerStream.done(null)
      aiState.done()
      closed = true
    }
  } finally {
    if (closed) {
      return
    }

    streams.uiStream.done()
    streams.textStream.done()
    streams.messageStream.done()
    streams.spinnerStream.done(null)
    aiState.done()
  }
}

async function submitUserMessage(content: string) {
  'use server'

  await rateLimit()

  const streams = createStreams()
  const aiState = getMutableAIState<AIProvider>()

  appendMessageToAIState(aiState, {
    role: 'user',
    content: [(aiState.get().interactions || []).join('\n\n'), content]
      .filter(Boolean)
      .join('\n\n')
  })

  // Intentionally not awaiting this:
  processAIState(aiState, streams)

  return {
    id: nanoid(),
    attachments: streams.uiStream.value,
    spinner: streams.spinnerStream.value,
    display: streams.messageStream.value
  }
}

async function processLLMRequest(
  aiState: MutableAIState<AIState>,
  streams: ReturnType<typeof createStreams>,
  previousError?: Error
) {
  const prompt = `\
    You are a friendly assistant that helps the user with booking flights to destinations that are based on a list of books. You can give travel recommendations based on the books, and will continue to help the user book a flight to their destination.

    The date today is ${format(new Date(), 'd LLLL, yyyy')}.
  
    Here's the flow: 
      1. List holiday destinations based on a collection of books.
      2. List flights to destination.
      3. Choose a flight.
      4. Choose a seat.
      5. Choose hotel
      6. Purchase booking.
      7. Show boarding pass.
      8. Show flight status.

    If lacking any information, be verbal about it! No matter what, DO NOT make up data you are uncertain about. Instead, you are encoraged to ask the user for questions about their preferences.
  `

  const history = aiState.get().messages.map(message => ({
    role: message.role,
    content: message.content
  }))

  history.unshift({ role: 'system', content: prompt.trim() })

  if (previousError) {
    if (previousError.toolName) {
      history.push({
        role: 'assistant',
        content: `Call '${previousError.toolName}' with arguments: ${previousError.toolArgs || {}}`
      })
    }

    history.push({ role: 'user', content: previousError.message })
    history.push({ role: 'user', content: 'Do not apologize for errors' })
  }

  const result = await streamText({
    model,
    temperature: 0,
    tools: Object.fromEntries(
      Object.entries(tools).map(([k, v]) => [k, v.definition])
    ),
    messages: [...history]
  })

  await handleLLMStream(result, aiState, streams)
}

async function handleLLMStream(
  result: any,
  aiState: MutableAIState<AIState>,
  streams: ReturnType<typeof createStreams>
) {
  let textContent = ''

  streams.spinnerStream.update(null)
  streams.uiStream.update(null)

  for await (const delta of result.fullStream) {
    switch (delta.type) {
      case 'text-delta':
        const { textDelta } = delta
        textContent += textDelta
        streams.messageStream.update(<BotMessage content={textContent} />)
        break

      case 'tool-call':
        const { toolName, args } = delta

        if (tools[toolName] === undefined) {
          throw new Error(`No tool '${toolName}' found.`)
        }

        tools[toolName].call(args, aiState, streams.uiStream)
        break

      case 'finish':
        console.log(`Finished as`, JSON.stringify(delta))

        if (textContent) {
          appendMessageToAIState(aiState, {
            role: 'assistant',
            content: textContent
          })
        }
        break

      case 'error':
        throw delta.error

      default:
        throw new Error(`Unknown stream type: ${delta.type}`)
    }
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
  initialAIState: { chatId: nanoid(), interactions: [], messages: [] },
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
