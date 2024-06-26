import { format } from 'date-fns'
import type { PrepareHistory } from './types'

export const describeImage = (imageData: string, mimeType: string) =>
  (history => [
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
          mimeType
        }
      ]
    }
  ]) as PrepareHistory

export const shoppingAssistant = (history => {
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

  history.unshift({ role: 'system', content: prompt.trim() })
  return history
}) as PrepareHistory
