// apps/web/components/ui/catalog/CatalogSearchBar.tsx
// Sprint 3.1.1 — Prominent search bar (search by title, author, category)

'use client'

import { useState, useRef } from 'react'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type CatalogSearchBarProps = {
  value: string
  onChange: (value: string) => void
  onSearch?: (value: string) => void
  placeholder?: string
  className?: string
}

export function CatalogSearchBar({
  value,
  onChange,
  onSearch,
  placeholder = 'Search by title, author, subject…',
  className,
}: CatalogSearchBarProps) {
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSearch?.(value)
    inputRef.current?.blur()
  }

  function handleClear() {
    onChange('')
    onSearch?.('')
    inputRef.current?.focus()
  }

  return (
    <form onSubmit={handleSubmit} className={cn('w-full', className)}>
      <div
        className={cn(
          'flex items-center gap-2 px-4 py-3 rounded-(--radius) bg-white border transition-all',
          focused
            ? 'border-green-700 shadow-(--shadow-focus-green)'
            : 'border-ink-200 shadow-(--shadow-sm) hover:border-ink-300'
        )}
      >
        <Search
          size={18}
          className={cn('flex-shrink-0 transition-colors', focused ? 'text-green-700' : 'text-ink-400')}
        />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-ink-900 placeholder:text-ink-300 focus:outline-none"
          style={{ fontSize: 'var(--text-base)', fontFamily: 'var(--font-body)' }}
        />
        {value && (
          <button
            type="button"
            onClick={handleClear}
            className="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full text-ink-400 hover:text-ink-700 hover:bg-ink-100 transition-colors"
          >
            <X size={12} />
          </button>
        )}
        <button
          type="submit"
          suppressHydrationWarning
          className={cn(
            'flex-shrink-0 px-4 py-1.5 rounded-sm font-semibold transition-colors',
            'bg-green-700 text-white hover:bg-green-800 active:bg-green-900',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-1'
          )}
          style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
        >
          Search
        </button>
      </div>
    </form>
  )
}