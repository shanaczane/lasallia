---
name: lasallia-ui
description: Lasallia design system reference. Load before making any UI changes — covers colors, typography, spacing tokens, component patterns, and layout structure so every update stays visually consistent.
tools:
  - Read
  - Edit
  - Write
  - Glob
  - Grep
  - Bash
---

# Lasallia UI Design System

This document is the single source of truth for the Lasallia design system. Read it before touching any UI file. Every visual decision must trace back to a token defined here.

---

## Color System

Defined as Tailwind CSS custom properties in `apps/web/app/globals.css` inside the `@theme` block. Always use these — never hardcode hex values unless a one-off inline override is unavoidable.

### Green — DLSL Brand Primary
| Token | Value | Usage |
|---|---|---|
| `--color-green-50` | `#F3F9F5` | Very light tint backgrounds |
| `--color-green-100` | `#E8F3ED` | Active nav item background |
| `--color-green-200` | `#A3CBB4` | Avatar background |
| `--color-green-300` | `#52A672` | Dark-mode primary |
| `--color-green-600` | `#00874A` | — |
| `--color-green-700` | `#006F3C` | Logo, active icon, primary button, notification dot |
| `--color-green-800` | `#004B28` | Active nav label text |
| `--color-green-900` | `#003D20` | Deepest green |

Tailwind utility classes: `bg-green-100`, `text-green-700`, `text-green-800`, etc. — these resolve through the `@theme` block automatically.

### Gold — DLSL Brand Accent
| Token | Value | Usage |
|---|---|---|
| `--color-gold-100` | `#F7EFD9` | Accent background (e.g. shadcn accent) |
| `--color-gold-500` | `#C8A951` | Mid-tone gold |
| `--color-gold-600` | `#B8923D` | Accent text / shadcn accent-foreground |

### Ink — Neutral Text / Borders / Surfaces
| Token | Value | Usage |
|---|---|---|
| `--color-ink-50` | `#F6F7F2` | Hover background on nav items |
| `--color-ink-100` | `#ECEEE7` | Dividers, muted surfaces |
| `--color-ink-200` | `#DDDFD7` | Borders (`border-ink-200`) |
| `--color-ink-300` | `#B8BBB1` | — |
| `--color-ink-400` | `#8E9189` | Muted icons, eyebrow labels |
| `--color-ink-500` | `#6B6E63` | Secondary text |
| `--color-ink-700` | `#3A3D34` | Strong secondary text |
| `--color-ink-900` | `#14150F` | Primary body text |

### Surface
| Token | Value | Usage |
|---|---|---|
| `--color-paper` | `#FAFAF5` | App background (`bg-paper`) |

### Status Colors
| State | Text token | Background token |
|---|---|---|
| Success | `--color-success: #16A34A` | `--color-success-bg: #DCFCE7` |
| Warning | `--color-warn: #C2730A` | `--color-warn-bg: #FEF3C7` |
| Danger | `--color-danger: #B91C1C` | `--color-danger-bg: #FEE2E2` |
| Info | `--color-info: #1D4ED8` | `--color-info-bg: #DBEAFE` |

### Availability Pill Colors
| Status | Text | Background |
|---|---|---|
| Available | `#16A34A` | `#DCFCE7` |
| Borrowed | `#0369A1` | `#E0F2FE` |
| Reserved | `#C2730A` | `#FEF3C7` |
| Missing | `#6D28D9` | `#EDE9FE` |

These are implemented in `apps/web/components/ui/pills/availability-pill.tsx`. Use that component — don't re-implement the colors.

---

## Typography

Three font families. **Never use Tailwind's built-in `text-sm`, `text-base`, `text-lg`, etc.** for font sizes — those resolve to unrelated values. Always use inline `style` with CSS variables.

```tsx
// CORRECT
<p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-body)" }}>
  …
</p>

// WRONG — do not use
<p className="text-sm font-body">…</p>
```

### Font Families
| Variable | Family | Role |
|---|---|---|
| `--font-display` | Fraunces (serif) | Logo mark, display headings, drop-caps |
| `--font-body` | Manrope (sans) | All body text, labels, nav items, UI copy |
| `--font-mono` | JetBrains Mono | ISBN / barcode values, code |

### Font Size Scale
| Variable | Value | Use for |
|---|---|---|
| `--text-2xs` | `0.625rem` | Badge numbers, eyebrow caps, section labels |
| `--text-xs` | `0.6875rem` | Avatar initials, tiny metadata |
| `--text-sm` | `0.75rem` | Tags, pill labels |
| `--text-sm-body` | `0.8125rem` | Nav item labels, form helpers, secondary captions |
| `--text-body` | `0.875rem` | Standard body text |
| `--text-base` | `0.9375rem` | Slightly larger body |
| `--text-lg` | `1.0625rem` | Section subheadings |
| `--text-xl` | `1.125rem` | Card headings |
| `--text-2xl` | `1.375rem` | Page section titles |
| `--text-3xl` | `1.75rem` | Page headings |
| `--text-4xl` | `2rem` | Large page titles |
| `--text-5xl` | `2.375rem` | Hero headings |
| `--text-6xl` | `2.75rem` | Display |
| `--text-7xl` | `4rem` | Max display |

### Letter Spacing
| Variable | Value | Use for |
|---|---|---|
| `--tracking-micro` | `0.02em` | Pill labels, fine text |
| `--tracking-eyebrow` | `0.05em` | Subtitle under logo |
| `--tracking-label` | `0.06em` | Form labels |
| `--tracking-meta` | `0.08em` | Meta captions |
| `--tracking-caps` | `0.10em` | All-caps UI labels |
| `--tracking-section` | `0.14em` | Sidebar section headers (OPERATIONS, MANAGE) |
| `--tracking-author` | `0.12em` | Author name display |

---

## Spacing & Structural Tokens

| Variable | Value | Usage |
|---|---|---|
| `--height-nav` | `64px` | Top nav height — always `style={{ height/top/paddingTop: "var(--height-nav)" }}` |
| `--width-side` | `248px` | Sidebar width (expanded) — always reference via var, not hardcoded |
| `--max-w-content` | `1400px` | Max content container width |
| `--max-w-form` | `380px` | Modal / login form max width |
| `--max-w-stepper` | `700px` | Multi-step form max width |
| `--height-qr-frame` | `200px` | QR / barcode scanner viewfinder |
| `--width-qr-frame` | `200px` | QR / barcode scanner viewfinder |
| `--min-h-chat` | `500px` | Chat interface min height |
| `--spacing-18` | `4.5rem` | — |
| `--spacing-22` | `5.5rem` | — |
| `--spacing-26` | `6.5rem` | — |

---

## Border Radius

| Variable | Value | Usage |
|---|---|---|
| `--radius-sm` | `6px` | Small interactive elements, buttons, nav items (`rounded-sm`) |
| `--radius` | `10px` | Default card radius |
| `--radius-lg` | `16px` | Modals, larger cards |
| `--radius-pill` | `999px` | Pills, badges, full-round elements |

---

## Shadows

| Variable | Usage |
|---|---|
| `--shadow-sm` | Subtle lift on small elements |
| `--shadow` | Standard card shadow |
| `--shadow-lg` | Modals, popovers |
| `--shadow-focus-green` | Focus ring on green-primary inputs |
| `--shadow-focus-danger` | Focus ring on error-state inputs |

---

## Z-Index

| Variable | Value | Layer |
|---|---|---|
| `--z-fab` | `50` | Floating action buttons |
| `--z-nav` | `100` | Top navigation bar |
| `--z-modal` | `200` | Modal overlays |

Use `z-(--z-nav)` Tailwind syntax or inline `style={{ zIndex: "var(--z-modal)" }}`.

---

## Layout Architecture

The app is structured around three role-based shell layouts. Every route inside a role group uses that role's layout as its Next.js nested layout (`app/<role>/layout.tsx`).

### LibrarianLayout (`components/layout/LibrarianLayout.tsx`)
- Fixed top nav: `TopNav` at `height: var(--height-nav)`, `z-(--z-nav)`
- Fixed desktop sidebar: `position: fixed; top: var(--height-nav); width: var(--width-side)` — collapses to `56px`
- Collapse state persisted in `localStorage("librarian-sidebar-collapsed")`
- SSR-safe: `useLayoutEffectSafe` (switches between `useLayoutEffect` / `useEffect` by `typeof window`)
- Mobile: slide-in drawer at full `var(--width-side)` with overlay (`z-150` / `z-160`)
- Page content: `<main>` with `paddingTop: var(--height-nav)` and `md:pl-(--width-side)` (transitions to `md:pl-14` when collapsed)
- Props: `userName`, `userInitials`, `notificationCount`

### StudentLayout / GuestLayout
- Same `TopNav`, different sidebar (or no sidebar for guest)

### TopNav (`components/layout/TopNav.tsx`)
- Logo: `32×32` green-700 square with rounded-sm, Fraunces "L"
- Title: "Smart Library" in Manrope `--text-sm-body`
- Subtitle: "De La Salle Lipa · LRC" in `--text-2xs` + `--tracking-eyebrow`, hidden on mobile
- Bell icon with green-700 notification dot (`14×14`, `--text-2xs`)
- Avatar: `30×30` green-200 circle with green-800 initials

---

## Component Patterns

### Cards
```tsx
<div className="bg-white rounded-[--radius] border border-ink-200 shadow-(--shadow) p-5">
  …
</div>
```
- Background: `bg-white` (not `bg-paper`)
- Border: `border border-ink-200`
- Shadow: `shadow-(--shadow)` or inline `style={{ boxShadow: "var(--shadow)" }}`
- Radius: `rounded-[--radius]` or `rounded-[10px]`

### Sidebar Nav Items
```tsx
<a
  className={cn(
    "flex items-center gap-2.5 px-2 py-1.5 rounded-sm transition-colors",
    isActive
      ? "bg-green-100 text-green-800 font-semibold"
      : "text-ink-500 hover:bg-ink-50 hover:text-ink-900"
  )}
>
  <span className={isActive ? "text-green-700" : "text-ink-400"}>{icon}</span>
  <span style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}>
    {label}
  </span>
</a>
```

### Section Headers in Sidebar
```tsx
<p
  className="px-2 mb-1 text-ink-400 uppercase font-semibold"
  style={{ fontSize: "var(--text-2xs)", letterSpacing: "var(--tracking-section)", fontFamily: "var(--font-body)" }}
>
  SECTION TITLE
</p>
```

### Availability Pills
Use `<AvailabilityPill status="available|borrowed|reserved|missing" />` from `components/ui/pills/availability-pill.tsx`. Never inline the pill colors.

### Primary Button
```tsx
<button className="flex items-center gap-1.5 rounded-sm bg-green-700 text-white hover:bg-green-800 transition-colors px-4 py-2"
  style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}>
  …
</button>
```

### Ghost / Secondary Button
```tsx
<button className="flex items-center gap-1.5 rounded-sm border border-ink-200 text-ink-700 hover:bg-ink-50 transition-colors px-4 py-2"
  style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}>
  …
</button>
```

### Danger Action
Text: `text-red-600` / `hover:text-red-700`. Background tint when needed: `bg-[--color-danger-bg]`.

### Page Heading Pattern
```tsx
<div className="px-6 pt-6 pb-4 border-b border-ink-100 flex items-center justify-between">
  <div>
    <h1 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-2xl)" }} className="text-ink-900 font-semibold">
      Page Title
    </h1>
    <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }} className="text-ink-500 mt-0.5">
      Subtitle / description
    </p>
  </div>
  {/* Right-side actions */}
</div>
```

### Table Pattern
```tsx
<div className="bg-white rounded-[--radius] border border-ink-200 shadow-(--shadow) overflow-hidden">
  <table className="w-full">
    <thead className="bg-ink-50 border-b border-ink-200">
      <tr>
        <th className="px-4 py-2.5 text-left text-ink-500 uppercase font-semibold"
          style={{ fontSize: "var(--text-2xs)", letterSpacing: "var(--tracking-caps)", fontFamily: "var(--font-body)" }}>
          Column
        </th>
      </tr>
    </thead>
    <tbody className="divide-y divide-ink-100">
      <tr className="hover:bg-ink-50 transition-colors">
        <td className="px-4 py-3 text-ink-900"
          style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}>
          …
        </td>
      </tr>
    </tbody>
  </table>
</div>
```

### Filter Bar
```tsx
<div className="flex flex-wrap items-center gap-2.5 px-5 py-3 bg-white border-b border-ink-100">
  {/* select / date inputs */}
</div>
```

---

## Tailwind Class Rules

Tailwind v4 canonical classes — use these, never the deprecated aliases:

| Correct | Never use |
|---|---|
| `shrink-0` | `flex-shrink-0` |
| `grow` | `flex-grow` |
| `min-w-95` | `min-w-[380px]` (when value matches a spacing token) |
| `max-w-40` | `max-w-[160px]` |
| `min-w-175` | `min-w-[700px]` |
| `max-w-50` | `max-w-[200px]` |
| `z-(--z-nav)` | `z-[100]` |
| `shadow-(--shadow)` | `shadow-[...]` for named tokens |

For arbitrary values that don't map to a spacing token, bracket syntax is fine: `w-[42px]`.

---

## Icons

Use `lucide-react`. Icon sizes in layout:
- Nav icons: `size={16}`
- Top nav action icons: `size={17}` (bell) / `size={18}` (menu)
- Content section icons: `size={18}` or `size={20}` depending on context
- Always pair with a `text-ink-400` class unless colored semantically

---

## Sprint Annotation Convention

Add a sprint comment above any new component or section:

```tsx
// Sprint 5.4 — Librarian Quick Scanner Interface
```

Commit messages must end with the sprint number in parentheses:

```
feat: add quick scanner interface (sprint 5.4)
```

---

## File Locations

| What | Where |
|---|---|
| Design tokens | `apps/web/app/globals.css` → `@theme` block |
| Role layouts | `apps/web/components/layout/LibrarianLayout.tsx`, `TopNav.tsx` |
| Shared UI components | `apps/web/components/ui/` (shadcn + owned copies) |
| Availability pill | `apps/web/components/ui/pills/availability-pill.tsx` |
| Utility (`cn`) | `apps/web/lib/utils.ts` |
| App routes | `apps/web/app/librarian/`, `apps/web/app/student/`, `apps/web/app/guest/` |
