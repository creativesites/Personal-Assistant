'use client'

import { useState } from 'react'
import { Textarea } from '@/components/ui'
import { AiRewriteToolbar } from './ai-rewrite-toolbar'
import type { CareerProfile } from './use-career-profile'

// CV Studio §4 Steps 2 & 3 — Professional Summary and Career Objectives.
// Both are single career_profiles text fields with the same rewrite-only
// AI toolbar (§6) — sharing one component rather than two near-identical
// ones.

function TextFieldWithAi({
  label, placeholder, value, token, onSave,
}: {
  label: string
  placeholder: string
  value: string
  token: string
  onSave: (v: string) => void
}) {
  const [text, setText] = useState(value)

  return (
    <div>
      <Textarea
        label={label}
        placeholder={placeholder}
        rows={5}
        value={text}
        onChange={e => setText(e.target.value)}
        onBlur={() => onSave(text)}
      />
      <AiRewriteToolbar text={text} token={token} onRewritten={rewritten => { setText(rewritten); onSave(rewritten) }} />
    </div>
  )
}

export function SummaryStep({
  profile, token, updateField,
}: {
  profile: CareerProfile
  token: string
  updateField: <K extends keyof CareerProfile>(key: K, value: CareerProfile[K]) => void
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">A 2-4 sentence overview recruiters read first. Rewrite your own words — Zuri never invents your experience.</p>
      <TextFieldWithAi
        label="Professional Summary"
        placeholder="A brief overview of your experience, strengths, and what you're looking for next..."
        value={profile.summary ?? ''}
        token={token}
        onSave={v => updateField('summary', v || null)}
      />
    </div>
  )
}

export function ObjectivesStep({
  profile, token, updateField,
}: {
  profile: CareerProfile
  token: string
  updateField: <K extends keyof CareerProfile>(key: K, value: CareerProfile[K]) => void
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">Optional — what you're aiming for next in your career.</p>
      <TextFieldWithAi
        label="Career Objectives"
        placeholder="What are you hoping to achieve in your next role or over the next few years?"
        value={profile.careerGoalsText ?? ''}
        token={token}
        onSave={v => updateField('careerGoalsText', v || null)}
      />
    </div>
  )
}
