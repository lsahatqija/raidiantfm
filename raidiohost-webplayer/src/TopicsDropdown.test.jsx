import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TopicsDropdown } from './TopicsDropdown'

vi.mock('./hooks/useTopics', () => ({
  useTopics: vi.fn(() => ({
    allTopics: [
      { _id: 'news', name: 'World News', category: 'news' },
      { _id: 'tech', name: 'Technology', category: 'technology' },
    ],
    subscribedIds: new Set(),
    isLoading: false,
    togglingIds: new Set(),
    toggleTopic: vi.fn(),
  })),
}))

describe('TopicsDropdown', () => {
  beforeEach(() => vi.clearAllMocks())

  it('clears the topic search when the dropdown is closed', async () => {
    const user = userEvent.setup()
    render(<TopicsDropdown accessToken="test-token" />)

    await user.click(screen.getByRole('button', { name: /radio topics/i }))
    await user.type(screen.getByRole('searchbox'), 'tech')
    expect(screen.queryByText('World News')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /radio topics/i }))
    await user.click(screen.getByRole('button', { name: /radio topics/i }))

    expect(screen.getByRole('searchbox')).toHaveValue('')
    expect(screen.getByText('World News')).toBeInTheDocument()
  })
})
