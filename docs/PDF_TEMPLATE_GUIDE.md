# PDF Template Guide

How Zuri's document/CV PDF templates work, where they live, and how to add
or polish one — including a workflow for using an external AI tool (ChatGPT,
Claude, etc.) to design a new template and paste the result back in.

---

## Architecture in one paragraph

Every PDF layout in this app — invoices/quotations/receipts/proposals and
résumés/cover letters/CVs — is a plain [`@react-pdf/renderer`](https://react-pdf.org/)
React component: `Document` / `Page` / `View` / `Text` / `Image` / `StyleSheet`
only, no HTML, no CSS, no browser DOM APIs. All of them live in **one shared
package**, `packages/pdf-templates/` (imported as `@zuri/pdf-templates`), so
there is exactly one copy of each template — not one for the server and a
second, silently-drifting copy for the browser.

- **Everything a user is actively looking at renders client-side**, in their
  own browser, via `apps/web/src/components/documents/ClientPdfRenderer.tsx`.
  The AI/backend only ever produces *data* (line items, totals, a résumé's
  bullet points, a cover letter's body text) — never a rendered PDF. The
  frontend fetches that data plus which template applies (`GET /api/documents/
  :id/render-context`), renders the PDF itself, and uploads the resulting
  bytes once to `POST /api/documents/:id/render-complete` so the server has a
  stored copy for WhatsApp delivery, the public share link, and status
  tracking.
- **A handful of genuinely headless flows still render server-side**, because
  there is no browser open to render in at all: WhatsApp auto-send on a
  scheduled/recurring document, the autonomous WhatsApp agent drafting a
  document mid-conversation, and Automatic Business Packs. These call the
  exact same template components from `@zuri/pdf-templates`, just from Node
  (`services/api/src/lib/pdf/render.ts`) instead of the browser. See CLAUDE.md's
  "PDF Rendering Architecture" section for the full list and reasoning.

This means **a template you write once works in both places automatically** —
you never need to think about server vs. client when designing a new layout.

---

## Where things live

```
packages/pdf-templates/
├── package.json              "@zuri/pdf-templates" — no build step, plain source
└── src/
    ├── index.ts               exports every template + the two lookup maps
    └── templates/
        ├── types.ts           TemplateProps / BusinessContext / DocumentContext / ContactContext
        ├── Minimal.tsx         business document layouts (8 of these)
        ├── Modern.tsx
        ├── Classic.tsx
        ├── Corporate.tsx
        ├── Elegant.tsx
        ├── Compact.tsx
        ├── Creative.tsx
        ├── Executive.tsx
        ├── Resume.tsx          CV/career document layouts
        ├── CvModern.tsx
        ├── CvExecutive.tsx
        ├── CvCreative.tsx
        ├── CoverLetter.tsx
        ├── ReferenceSheet.tsx
        └── PortfolioPdf.tsx
```

`packages/pdf-templates/src/index.ts` also exports two lookup maps used by
both the server and client renderers to pick a component by key:

```ts
export const BUSINESS_TEMPLATES = { minimal, modern, classic, corporate, elegant, compact, creative, executive }
export const CV_TEMPLATES = { professional /* = Resume */, modern, executive, creative }
```

---

## The business-document prop shape (`TemplateProps`)

Every business-document template (invoice/quotation/receipt/proposal/etc.)
is a `function MyTemplate({ document, business, contact }: TemplateProps)`.
All three objects are already fully formatted strings — money and dates are
pre-formatted server-side (or, for a client render, by the exact same code
via `GET /api/documents/:id/render-context`) — a template never does its own
currency math or date arithmetic.

```ts
interface DocumentContext {
  documentType: string          // 'invoice' | 'quotation' | 'receipt' | ...
  documentNumber: string        // "INV-0042"
  title: string
  issueDate: string             // "18 Jul 2026" — already formatted
  validUntil: string | null     // quotations only
  dueDate: string | null        // invoices only
  lineItems: {
    description: string
    quantity: number
    unitPrice: string           // "K 120.00" — already formatted, includes currency symbol
    discountLabel: string       // "10%" or "—"
    lineTotal: string           // already formatted
  }[]
  hasItems: boolean              // false for a document with no line items yet
  hasDiscounts: boolean           // true if any line item has a discount — show/hide the column
  subtotal: string
  discount: string | null        // null if there's no discount to show
  tax: string | null
  total: string
  notes: string | null
  terms: string | null
  sections: { heading: string; body: string }[]   // free-form AI-generated sections (proposals/contracts)
}

interface BusinessContext {
  companyName: string | null
  address: string | null
  phone: string | null
  email: string | null
  website: string | null
  taxId: string | null
  themeColor: string              // hex, defaults to '#4F46E5' — use for accents/headers
  accentColor: string             // hex, defaults to '#818CF8'
  footerText: string | null
  paymentInstructions: string | null
  bankDetails: string | null      // pre-joined "Bank, Account Name, Account No." or null
  mobileMoney: string | null      // pre-joined "Provider, Number" or null
  logoDataUri: string | null      // ready to drop straight into <Image src={...}>
  signatureDataUri: string | null
  stampDataUri: string | null
}

interface ContactContext {
  name: string
  company: string | null
  email: string | null
  phone: string | null
}
```

## The CV/career prop shapes

CV Studio's Master CV templates take `CvTemplateProps` (exported from
`CvModern.tsx`) — no `business`/`contact` wrapper, since a CV is about the
user themselves:

```ts
interface CvTemplateProps {
  fullName: string
  headline?: string
  summary?: string
  contactLine?: string            // pre-joined "City · phone · email · linkedin.com/..."
  pageSize?: string                // 'A4' | 'Letter'
  experience?: { title: string; company: string; location?: string; startDate?: string; endDate?: string | null; current?: boolean; bullets?: string[] }[]
  education?: { institution: string; degree?: string; field?: string; year?: string }[]
  skillGroups?: { groupName: string; skills: string[] }[]
  certifications?: { name: string; issuer?: string; year?: string }[]
  projects?: { title: string; description?: string }[]
  awards?: { title: string; issuer?: string; description?: string }[]
  volunteer?: { role?: string; organisation: string; description?: string }[]
  memberships?: { institution: string }[]
  publications?: { title: string; publisher?: string }[]
  referencesMode?: string          // 'available_on_request' | 'listed'
  references?: { name: string; company?: string }[]
}
```

The whole-document AI-generate flow (Resume Studio) uses the narrower
`ResumeProps` (flat `skills: string[]` + `languages`, no `skillGroups`) —
`Resume.tsx` (the "professional" / default CV template) accepts both shapes
since it's shared by both flows; unused fields are simply absent.

Cover letters and their siblings (`application_letter`, `expression_of_
interest`, `personal_statement`, `motivation_letter`) all share one template,
`CoverLetterProps`:

```ts
interface CoverLetterProps {
  fullName: string
  contactLine?: string
  date: string
  recipientName?: string | null
  companyName?: string | null
  body: string
  signOff: string
}
```

`ReferenceSheetProps` (`fullName`, `contactLine`, `references: {name, company?,
relationship?, phone?, email?}[]`) and `PortfolioPdfProps` (`fullName`,
`contactLine`, `projects: {title, description?}[]`) are the two remaining
Supporting Document templates — both deliberately plain, since their value is
the listed information, not the layout.

---

## Styling conventions (follow these in every template)

- **`@react-pdf/renderer` primitives only** — `Document`, `Page`, `View`,
  `Text`, `Image`, `StyleSheet`. No HTML tags, no CSS classes, no
  `dangerouslySetInnerHTML`.
- **Fonts: `Helvetica` / `Helvetica-Bold` only.** Never call `Font.register()`
  — that fetches a font file over the network at render time, which the
  server-side render path (a Node process with no guaranteed internet
  access at render time in every deployment) can't rely on, and which would
  make the client-side render path flash unstyled text while it downloads.
  Every existing template proves a professional look is fully achievable
  with just these two.
- **Page size**: `<Page size="A4" style={styles.page}>` for business
  documents. CV templates additionally respect a `pageSize` prop (`'A4'` or
  `'Letter'`) — pass it through to `<Page size={pageSize}>`.
- **Explicit `import React from 'react'`** at the top of every template file
  — required for the shared package to render correctly in both the Node
  (`tsx`) and browser (webpack) toolchains that consume it.
- **`// @ts-nocheck`** as the very first line of the file (see `Minimal.tsx`)
  — `@react-pdf/renderer`'s JSX typings don't line up cleanly with React 19;
  this is a real, already-established accommodation, not something to "fix"
  per template.
- **Theme color**: use `business.themeColor`/`business.accentColor` for
  accents (header bands, totals highlight, section labels) rather than a
  hardcoded color, so a user's brand color actually shows up in the
  document. It's fine for one template's *design identity* to lean into a
  fixed accent hue on top of that (e.g. `Creative.tsx`'s sidebar color) —
  just still respect `themeColor` where the design calls for "the user's
  brand color" specifically.
- **Optional fields render conditionally, never as empty rows.** Every
  existing template does `{document.discount ? <Row/> : null}` rather than
  always rendering a row that might say "—" — follow that pattern.
- **No client-only or server-only APIs** inside a template component — no
  `fs`, no `fetch`, no `window`/`document` (the global, not the prop!). A
  template is a pure function of its props; all data-gathering (formatting
  money, resolving a logo to a URL, joining an address into one line)
  happens in `services/api/src/lib/pdf/context.ts` (business docs) or
  `services/api/src/lib/pdf/cv-context.ts` (CVs) before the template ever
  sees it.

---

## Adding a brand-new template

1. Create `packages/pdf-templates/src/templates/YourTemplate.tsx`, default-
   exporting a function component with the exact prop shape above (`{document,
   business, contact}: TemplateProps` for a business-document template, or
   `CvTemplateProps` for a CV template).
2. Register it in `packages/pdf-templates/src/index.ts`:
   - Business template: add the import/export and add a key to
     `BUSINESS_TEMPLATES` (the key is the `layout_key` value).
   - CV template: add the import/export and add a key to `CV_TEMPLATES` (the
     key is the `template_key` value).
3. For a business template, add a matching seed row to
   `document_templates` via a new migration (`layout_key`, `name`,
   `is_system = true`, `applicable_to`) so it shows up in the Template Picker
   UI (`apps/web/src/app/(dashboard)/documents/_components/template-picker.tsx`).
   A CV template needs no migration — `career_cvs.template_key` is a free
   string, and the wizard's template dropdown is just a hardcoded list next
   to `CV_TEMPLATES`'s keys.
4. Run `npm run typecheck --workspace=@zuri/pdf-templates` (or just typecheck
   `apps/web`/`services/api`, both of which import the package) — there's no
   separate build step for this package, so a green typecheck is the whole
   verification bar.

## Editing an existing template

Just edit the file directly in `packages/pdf-templates/src/templates/`. Since
both the server render path (headless flows) and the client render path
(everything else) import from this one file, there is nothing else to keep
in sync.

---

## Using an external AI to design or polish a template

Since every template is one self-contained file with a documented prop
shape, you can hand this exact workflow to any AI tool (a separate ChatGPT/
Claude conversation, etc.) without it needing access to this codebase:

1. **Paste this guide** (or at least the "Styling conventions" and the
   relevant prop-shape section above) into the other AI's conversation.
2. **Paste one existing template file as a concrete example** — `Minimal.tsx`
   or `Modern.tsx` for a business document, `CvModern.tsx` for a CV — so the
   AI can see the real code shape, not just the type signature.
3. **Describe the look you want** — "a template with a bold red header band
   and a serif-style title," "a two-column CV with a dark sidebar," etc.
4. Ask it to **return one complete `.tsx` file** following the same
   structure: the `@ts-nocheck` comment, `import React from 'react'`, the
   `@react-pdf/renderer` import, a `StyleSheet.create({...})` block, and a
   default-exported function component with the exact prop shape from step 1.
5. **Paste the returned file back here** (to Zuri) and ask to add or update
   the template — reference this doc so the registration steps above get
   followed (new file in `packages/pdf-templates/src/templates/`, registered
   in `index.ts`, migration seed row if it's a business template).

A template generated this way needs no changes to work in both the server
and client render paths — that's the whole point of the shared-package
architecture above.
