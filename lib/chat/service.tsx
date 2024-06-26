import { streamText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { BotMessage } from '@/components/stocks'
import { SpinnerMessage, SystemMessage } from '@/components/stocks/message'
import {
  MutableAIState,
  AIState,
  Message as AIStateMessage,
  PrepareHistory
} from './types'
import { createStreams, closeStreams, appendMessageToAIState } from './utils'
import * as tools from './tools'

const model = anthropic('claude-3-haiku-20240307')

const processAIState = async (
  aiState: MutableAIState<AIState>,
  streams: ReturnType<typeof createStreams>,
  prepareHistory: PrepareHistory
) => {
  try {
    const result = await initiateStreamText(aiState, prepareHistory)
    await handleTextStream(aiState, streams, result)
  } catch (error) {
    console.error('Error in LLM request:', error)

    if (error.name === `AI_InvalidToolArgumentsError`) {
      console.log(`Retrying...`)

      try {
        // Inform the user about the new attempt
        streams.ui.update(
          <>
            <SystemMessage>
              Please, allow me just one more second while I try again...
            </SystemMessage>
            <SpinnerMessage />
          </>
        )

        // Retry the LLM request with error information
        const result = await initiateStreamText(
          aiState,
          prepareHistory,
          error as Error
        )
        await handleTextStream(aiState, streams, result)
      } catch (retryError) {
        console.error('Error in RETRY attempt:', retryError)
        closeStreams(streams, retryError as Error)
        aiState.done()
        return
      }
    } else {
      closeStreams(streams, error as Error)
      aiState.done()
      return
    }
  }

  closeStreams(streams)
  aiState.done()
}

async function initiateStreamText(
  aiState: MutableAIState<AIState>,
  prepareHistory: PrepareHistory,
  previousError?: Error
) {
  const history = prepareHistory(
    aiState.get().messages.map(message => ({
      role: message.role,
      content: message.content
    }))
  )

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

  return await streamText({
    model,
    temperature: 0,
    tools: Object.fromEntries(
      Object.entries(tools).map(([k, v]) => [k, v.definition])
    ),
    messages: [...history]
  })
}

async function handleTextStream(
  aiState: MutableAIState<AIState>,
  streams: ReturnType<typeof createStreams>,
  result: Awaited<ReturnType<typeof streamText>>,
  onFinish?: (textContent: string) => void
) {
  onFinish =
    onFinish ||
    (content => {
      if (!content) {
        return
      }

      appendMessageToAIState(aiState, {
        role: 'assistant',
        content
      })
    })

  let textContent = ''
  streams.spinner.update(null)
  streams.ui.update(null)

  for await (const delta of result.fullStream) {
    switch (delta.type) {
      case 'text-delta':
        const { textDelta } = delta
        textContent += textDelta
        streams.message.update(<BotMessage content={textContent} />)
        break

      case 'tool-call':
        const { toolName, args } = delta

        if (tools[toolName] === undefined) {
          throw new Error(`No tool '${toolName}' found.`)
        }

        tools[toolName].call(args, aiState, streams.ui)
        break

      case 'finish':
        console.log(`Finished as`, JSON.stringify(delta))
        onFinish(textContent)
        break

      case 'error':
        throw delta.error

      default:
        throw new Error(`Unknown stream type: ${delta.type}`)
    }
  }
}

export default class AIService {
  streams = createStreams()

  close = (error?: Error) => {
    closeStreams(this.streams, error)
    this.aiState.done()
  }

  appendMessage = (newMessage: AIStateMessage) =>
    appendMessageToAIState(this.aiState, newMessage)

  processAIState = (prepareHistory: PrepareHistory) =>
    processAIState(this.aiState, this.streams, prepareHistory)

  initiateStreamText = (
    prepareHistory: PrepareHistory,
    previousError?: Error
  ) => initiateStreamText(this.aiState, prepareHistory, previousError)

  handleTextStream = (
    result: Awaited<ReturnType<typeof streamText>>,
    onFinish?: (textContent: string) => void
  ) => handleTextStream(this.aiState, this.streams, result, onFinish)

  constructor(private aiState: MutableAIState<AIState>) {}
}
