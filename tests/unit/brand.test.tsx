import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Logo } from '@/components/brand/Logo'

describe('Logo', () => {
  it('exibe nome e slogan', () => {
    render(<Logo slogan />)
    expect(screen.getByText(/OPINEX/)).toBeInTheDocument()
    expect(screen.getByText('Inteligência na coleta. Precisão na informação.')).toBeInTheDocument()
  })
})
