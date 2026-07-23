# UI Design System & Component Library

> Detailed specification of Zuri's UI design system, component library, interaction patterns, layout mechanics, responsive behavior, and mode-gating rules.

---

## 1. Design System & Aesthetics

### Brand Palette & Color Tokens

Zuri uses a modern, dark-accented glassmorphic and clean indigo design language across web workspaces:

| Token | Class / Hex | Application |
|-------|-------------|-------------|
| **Primary** | `indigo-600` (`#4F46E5`), Hover: `indigo-700` | Primary buttons, active tab indicators, links, active state glows |
| **Primary Light** | `indigo-50` / `indigo-100` | Highlighted rows, active sidebar items, soft badge backgrounds |
| **Surface** | `bg-white` with `border-gray-200` & `shadow-sm` | Workspace cards, inbox panels, modal dialogs, data tables |
| **Page Background** | `bg-gray-50` | Standard dashboard route backgrounds |
| **Text Primary** | `text-gray-900` | Headings, primary titles, emphasized stats |
| **Text Body** | `text-gray-700` | Standard message content, descriptions, body copy |
| **Text Muted** | `text-gray-500` / `text-gray-400` | Subtitles, timestamps, empty state descriptions, placeholders |
| **Success** | `emerald-600` / `green-500` | Connected status, positive delta stats, paid invoices, high health scores |
| **Warning** | `amber-500` / `yellow-600` | Pending approvals, warm leads, connecting status, expiring quotes |
| **Danger** | `red-600` / `rose-500` | Errors, disconnected status, churn risk alerts, delete actions |
| **Purple / AI** | `purple-600` / `indigo-500` | AI generated suggestions, AI reasoning badges, autonomous actions |

### Dark Glassmorphism Theme (Onboarding & Pairing)
For QR scanning, pairing code, and initial connection screens, Zuri applies a premium dark glassmorphic theme:
- Background: `bg-slate-950` with subtle radial gradients (`from-indigo-900/20 to-slate-950`)
- Cards: `bg-slate-900/80 backdrop-blur-md border border-slate-800`
- Text: `text-slate-100` headings, `text-slate-400` body text

---

## 2. Micro-Animations & Motion Design

All animations use fluid cubic-bezier curves for a state-of-the-art feel:

| Class | Animation Keyframes | Duration / Easing | Usage |
|-------|--------------------|-------------------|-------|
| `.animate-message-entry` | `from { opacity: 0; transform: translateY(8px) scale(0.98); }` | `0.3s cubic-bezier(0.16, 1, 0.3, 1)` | Incoming WhatsApp chat bubbles, new suggestion cards |
| `.animate-pulse-slow` | `opacity: 1 <-> 0.4` | `2s cubic-bezier(0.4, 0, 0.6, 1) infinite` | Live status dots, typing indicators |
| `.animate-shimmer` | `background-position: 200% <-> -200%` | `1.8s ease-in-out infinite` | Skeleton loading sweep |
| `.animate-indeterminate` | `translateX(-100%) -> translateX(300%)` | `1.4s ease-in-out infinite` | Top progress bars during background syncing |

---

## 3. Responsive Layout & Navigation Architecture

### Responsive Breakpoints

| Breakpoint | Width | Behavior |
|------------|-------|----------|
| `sm` | `640px` | Small devices, stacked grid layouts turn into 2-column |
| `md` | `768px` | Desktop navigation active (`md:pl-64`), bottom bar hidden |
| `lg` | `1024px` | 3-panel inbox layout enabled, multi-column analytics grids |
| `xl` | `1280px` | Extended sidebars (e.g., Contact detail panel in Inbox) |

### Desktop Layout (`apps/web/src/app/(dashboard)/layout.tsx`)
- **Fixed Sidebar**: Width `w-64`, fixed position `left-0 top-0 bottom-0`. Contains workspace brand logo, mode badge indicator, grouped menu links (Inbox, CRM, ERP, Documents, Knowledge Brain, Career, Admin), user profile card, and global WhatsApp status widget (`WAStatusWidget`).
- **Main Container**: Offset by `md:pl-64`.
- **Horizontal Sub-Navigations**: Specialized modules (such as `/analytics`) feature a sticky, horizontal scrollable bar (`AnalyticsSubNav`) with active tab highlight pills.

### Mobile Navigation Layout
- **Mobile Top Bar**: Fixed `top-0 left-0 right-0 h-14 bg-white/95 backdrop-blur border-b`. Contains mobile hamburger drawer trigger, Zuri logo with live glowing WA status dot, and notifications bell.
- **Mobile Bottom Tab Bar**: Fixed `bottom-0 left-0 right-0 h-14 bg-white border-t flex items-center justify-around z-40`. Mode-aware 4 primary tabs:
  - **Business Mode**: Home (`/dashboard`), Inbox (`/inbox`), Contacts (`/contacts`), Suggestions (`/inbox/queue`)
  - **Personal Mode**: Home (`/dashboard`), Inbox (`/inbox`), People (`/relationships`), Proactive (`/proactive`)
  - **Hybrid Mode**: Home (`/dashboard`), Inbox (`/inbox`), Contacts (`/contacts`), Proactive (`/proactive`)
- **Content Clearance**: All page views wrap inside `pt-14 pb-14 md:pt-0 md:pb-0` to eliminate content clipping behind fixed mobile headers and footers.

---

## 4. UI Component Library Reference

All core components live in `apps/web/src/components/ui/` and export typed React components:

### `Button` (`button.tsx`)
Standard action trigger component with loading state spinner and disabled behavior.
- **Variants**: `primary` (`bg-indigo-600 text-white hover:bg-indigo-700`), `secondary` (`bg-gray-100 text-gray-900 hover:bg-gray-200`), `ghost` (`hover:bg-gray-100 text-gray-700`), `danger` (`bg-red-600 text-white hover:bg-red-700`), `outline` (`border border-gray-300 text-gray-700 hover:bg-gray-50`)
- **Sizes**: `xs` (`px-2 py-1 text-xs`), `sm` (`px-3 py-1.5 text-sm`), `md` (`px-4 py-2 text-sm`), `lg` (`px-5 py-2.5 text-base`)
- **Props**: `isLoading?: boolean`, `leftIcon?: ReactNode`, `rightIcon?: ReactNode`

### `Badge` (`badge.tsx`)
Status indicators and category tags.
- **Variants**: `default` (grey), `info` (blue), `success` (emerald), `warning` (amber), `error` (red), `purple` (AI/autonomous), `indigo` (primary)
- **Shape**: Rounded pill (`rounded-full px-2.5 py-0.5 text-xs font-medium`)

### `ModeBadge` (`mode-badge.tsx`)
Displays active user operational mode (`Personal`, `Business`, `Hybrid`) with distinct color themes.

### `Card` (`card.tsx`)
Card container wrapper with standard radius and elevation (`bg-white rounded-xl border border-gray-200 shadow-sm p-5`). Subcomponents: `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`.

### `Input` & `Select` (`input.tsx`, `select.tsx`)
Form control wrappers forwarding ref with label support, icon slots, error states, and focus ring styling (`focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500`).

### `Modal` & `ConfirmModal` (`modal.tsx`)
Portal-based dialog system mounted to `document.body`:
- Features backdrop blur overlay (`bg-black/50 backdrop-blur-sm`), Esc key dismiss, outside click dismiss, focus trapping, and header/body/footer layout.
- `ConfirmModal`: Specialized confirmation dialog with danger/warning button styles for destructive actions (e.g. deleting contacts, canceling sync).

### `Toast` & `ToastProvider` (`toast.tsx`)
Global notification feedback system managed via the `useToast()` hook:
- Toast types: `success`, `error`, `info`, `warning`
- Slide-in bottom-right positioning on desktop, top-center on mobile
- Auto-dismiss timer (default 4 seconds) with manual close button

### `Avatar` (`avatar.tsx`)
Renders contact profile photos or fallback initials:
- **Sizes**: `xs` (20px), `sm` (32px), `md` (40px), `lg` (48px), `xl` (64px)
- **Features**: Generates deterministic background colors based on name strings; optional online/offline status badge overlay dot.

### `DataTable` (`data-table.tsx`)
Generic, sortable, paginated data table component:
- Supports column sorting by click, custom cell renderers, row click handlers, selection checkboxes, custom key extractors, and built-in empty states.

### `Tabs` (`tabs.tsx`)
Tabbed navigation component:
- **Variants**: `underline` (classic bottom border tab) and `pill` (background highlight pill)
- Render-prop and controlled state API.

### `Dropdown` (`dropdown.tsx`)
Menu popover triggered by click, with keyboard arrow navigation, icon support, and item dividers.

### `HealthBar` (`health-bar.tsx`)
Visualizes relationship health scores (0–100):
- Color gradient mapping: 0–39 (Red/Danger), 40–69 (Amber/Warning), 70–100 (Emerald/Healthy)
- Renders smooth progress track with animated fill width.

### `StatCard` (`stat-card.tsx`)
Executive dashboard KPI component displaying label, numerical metric, trend percentage indicator (up/down arrow with color coding), and optional top-right icon.

### `Skeleton` (`skeleton.tsx`)
Shimmer loading placeholder components:
- `SkeletonText`: Simulates text lines
- `SkeletonCard`: Simulates card structures
- `SkeletonListItem`: Simulates list rows

### `EmptyState` (`empty-state.tsx`)
Centered empty view with icon, title, description, and primary action CTA button.

### `PageHeader` (`page-header.tsx`)
Standardized header banner for dashboard pages with title, description, optional breadcrumb trail, and right-hand action button slot.

### `FeatureGate` (`feature-gate.tsx`)
Mode-gating utility component wrapping features:
```tsx
<FeatureGate modes={['business', 'hybrid']} fallback={<UpgradeBanner />}>
  <SalesOrderGenerator />
</FeatureGate>
```

---

## 5. Complex Interactive Systems & Micro-Interactions

### Shared Team Inbox (`apps/web/src/app/(dashboard)/inbox/page.tsx`)
- **Desktop 3-Panel Layout**:
  1. Conversation List (Left panel, width 320px) — search, filter by unread/assigned, WA status, last message preview.
  2. Active Message Thread (Center panel, flex-1) — WhatsApp-formatted message bubble history, typing indicators, active collision warnings.
  3. Contact Context Sidebar (Right panel, width 360px, collapsible) — CRM details, relationship health score, deal stage, AI notes, business timeline.
- **Active Collision Warning**: When multiple team members view the same conversation, a banner appears: *"John is currently viewing this thread"*. If another agent is typing, the reply dock shows a lock overlay to prevent double-replies.
- **Reply Dock**: Auto-clears input field immediately upon message send; includes AI suggestion drawer ("Approve 1-Click", "Edit", "Regenerate").

### E-Signature Canvas Pad (`apps/web/src/components/ui/signature-pad.tsx`)
- **HTML5 Canvas**: Uses `window.devicePixelRatio` for 1:1 crisp rendering on High-DPI / Retina displays.
- **Stroke Quality**: Features Pointer Capture (`setPointerCapture`) for smooth drag tracking and Bézier curve smoothing algorithms to eliminate jagged lines.
- **Controls**: Clear canvas, undo stroke, download PNG, auto-trim whitespace, and save signature.

### Chat Formatter (`apps/web/src/components/ui/chat-formatter.tsx`)
- Parses WhatsApp markdown formatting into styled HTML:
  - `*bold*` → `<strong>`
  - `_italic_` → `<em>`
  - `~strikethrough~` → `<del>`
  - `` `code` `` → `<code>`
  - `> quote` → `<blockquote>`
- Auto-detects URLs and converts them into clickable external links (`target="_blank" rel="noopener noreferrer"`).
- Displays double-tick delivery status indicators (sent, delivered, read blue ticks).

### Command Palette (`apps/web/src/components/command-palette.tsx`)
- Global `Cmd+K` / `Ctrl+K` keyboard shortcut trigger.
- Instant search across contacts, documents, tools, and pages.
- Full arrow-key navigation with `Enter` action selection.

---

## 6. Mode-Gating & Scoping Conventions

1. **User Mode Broadcaster**: `useZuriSession()` exposes `session.data?.mode` (`personal`, `business`, `hybrid`).
2. **Conditional UI**:
   - `Personal Mode`: Hides Lead scores, Sales pipelines, Invoice/Quote action cards, and AI Notes tab on Contact detail pages.
   - `Business Mode`: Replaces personal proactive nudges with sales follow-ups and lead deal stages.
   - `Hybrid Mode`: Exposes both personal maintenance and business tools.
3. **Organization Workspace Scoping**: `session.data?.organizationId` automatically scopes all API requests to the active Clerk Organization team workspace.
