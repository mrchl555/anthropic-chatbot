import 'server-only'

import {
  createStreamableUI,
  getMutableAIState,
  createStreamableValue
} from 'ai/rsc'
import { BotCard } from '@/components/stocks'
import { nanoid, sleep } from '@/lib/utils'
import { CheckIcon, SpinnerIcon } from '@/components/ui/icons'
import { Video } from '@/components/media/video'
import { rateLimit } from './ratelimit'
import * as prompts from './prompts'
import AIService from './service'
import type { AIProvider } from './types'

export async function describeImage(imageBase64: string) {
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

export async function submitUserMessage(content: string) {
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
