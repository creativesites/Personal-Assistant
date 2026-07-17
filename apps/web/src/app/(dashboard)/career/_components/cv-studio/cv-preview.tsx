'use client'

import { useEffect, useState } from 'react'
import { apiClient } from '@/lib/api'
import type { CareerProfile } from './use-career-profile'

// CV Studio §9 — Live Preview. A lightweight HTML/CSS mirror of the
// "Professional" template's layout (single-column, ATS-plain) — not a PDF
// round-trip per keystroke. career_profiles fields (personal details/
// summary) update instantly since they're passed down from the wizard's
// already-live local state; the per-entry-table sections (employment,
// education, etc.) refetch when `refreshKey` changes, i.e. right after a
// save in any of those steps — an honest simplification of true per-
// keystroke reactivity for data that lives in nine separate tables, not a
// PDF re-render on every keystroke (that's what §5/§9's real render
// pipeline is for, Phase 5+).

interface EntryItem { id: string; [key: string]: unknown }

interface PreviewData {
  employment: EntryItem[]
  education: EntryItem[]
  certifications: EntryItem[]
  skillGroups: EntryItem[]
  awards: EntryItem[]
  volunteer: EntryItem[]
  memberships: EntryItem[]
  publications: EntryItem[]
  references: EntryItem[]
}

const EMPTY: PreviewData = {
  employment: [], education: [], certifications: [], skillGroups: [], awards: [],
  volunteer: [], memberships: [], publications: [], references: [],
}

function dateRange(start: unknown, end: unknown, isCurrent?: unknown) {
  const s = start ? String(start).slice(0, 7) : ''
  const e = isCurrent ? 'Present' : (end ? String(end).slice(0, 7) : '')
  return [s, e].filter(Boolean).join(' – ')
}

export function CvPreview({
  token, profile, projectLinks, refreshKey,
}: {
  token: string
  profile: CareerProfile | null
  projectLinks: { projectId: string; projectTitle?: string; customDescriptionOverride?: string | null }[]
  refreshKey: number
}) {
  const [data, setData] = useState<PreviewData>(EMPTY)

  useEffect(() => {
    Promise.all([
      apiClient<{ items: EntryItem[] }>('/api/career/employment-history', { token }),
      apiClient<{ items: EntryItem[] }>('/api/career/education', { token }),
      apiClient<{ items: EntryItem[] }>('/api/career/certifications', { token }),
      apiClient<{ items: EntryItem[] }>('/api/career/skill-groups', { token }),
      apiClient<{ items: EntryItem[] }>('/api/career/awards', { token }),
      apiClient<{ items: EntryItem[] }>('/api/career/volunteer-work', { token }),
      apiClient<{ items: EntryItem[] }>('/api/career/memberships', { token }),
      apiClient<{ items: EntryItem[] }>('/api/career/publications', { token }),
      apiClient<{ items: EntryItem[] }>('/api/career/references', { token }),
    ]).then(([employment, education, certifications, skillGroups, awards, volunteer, memberships, publications, references]) => {
      setData({
        employment: employment.items, education: education.items, certifications: certifications.items,
        skillGroups: skillGroups.items, awards: awards.items, volunteer: volunteer.items,
        memberships: memberships.items, publications: publications.items, references: references.items,
      })
    }).catch(() => {})
  }, [token, refreshKey])

  if (!profile) return null

  const contactLine = [profile.location, profile.phone, profile.githubUrl, profile.linkedinUrl, profile.portfolioUrl]
    .filter(Boolean).join(' · ')

  return (
    <div className="bg-white rounded-[1.25rem] shadow-sm shadow-gray-200/70 border border-gray-100 p-6 sm:p-8 text-[13px] leading-relaxed text-gray-800 font-serif">
      <div className="text-center border-b border-gray-200 pb-4 mb-4">
        <h1 className="text-xl font-bold text-gray-950">{profile.headline || 'Your Professional Title'}</h1>
        {contactLine && <p className="text-[11px] text-gray-500 mt-1">{contactLine}</p>}
      </div>

      {profile.summary && (
        <section className="mb-4">
          <h2 className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1">Summary</h2>
          <p>{profile.summary}</p>
        </section>
      )}

      {data.employment.length > 0 && (
        <section className="mb-4">
          <h2 className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1">Employment History</h2>
          {data.employment.map(e => (
            <div key={e.id} className="mb-2">
              <div className="flex justify-between font-semibold text-gray-900">
                <span>{String(e.title)} — {String(e.employer)}</span>
                <span className="text-gray-500 font-normal">{dateRange(e.startDate, e.endDate, e.isCurrent)}</span>
              </div>
              {!!e.achievements && Array.isArray(e.achievements) && e.achievements.length > 0 && (
                <ul className="list-disc list-inside">
                  {(e.achievements as string[]).map((a, i) => <li key={i}>{a}</li>)}
                </ul>
              )}
              {!e.achievements || (Array.isArray(e.achievements) && e.achievements.length === 0 && e.responsibilities) ? (
                <p>{String(e.responsibilities ?? '')}</p>
              ) : null}
            </div>
          ))}
        </section>
      )}

      {data.education.length > 0 && (
        <section className="mb-4">
          <h2 className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1">Education</h2>
          {data.education.map(e => (
            <div key={e.id} className="flex justify-between mb-1">
              <span>{String(e.qualification ?? '')}{e.programme ? `, ${e.programme}` : ''} — {String(e.institution)}</span>
              <span className="text-gray-500">{e.endDate ? String(e.endDate).slice(0, 4) : ''}</span>
            </div>
          ))}
        </section>
      )}

      {data.certifications.length > 0 && (
        <section className="mb-4">
          <h2 className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1">Certifications</h2>
          {data.certifications.map(c => (
            <p key={c.id}>{String(c.name)}{c.issuer ? ` — ${c.issuer}` : ''}</p>
          ))}
        </section>
      )}

      {data.skillGroups.length > 0 && (
        <section className="mb-4">
          <h2 className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1">Skills</h2>
          {data.skillGroups.map(g => (
            <p key={g.id}><span className="font-semibold">{String(g.groupName)}:</span> {(g.skills as string[]).join(', ')}</p>
          ))}
        </section>
      )}

      {projectLinks.length > 0 && (
        <section className="mb-4">
          <h2 className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1">Projects</h2>
          {projectLinks.map(p => (
            <p key={p.projectId}>{p.customDescriptionOverride || p.projectTitle}</p>
          ))}
        </section>
      )}

      {data.awards.length > 0 && (
        <section className="mb-4">
          <h2 className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1">Awards</h2>
          {data.awards.map(a => <p key={a.id}>{String(a.title)}{a.issuer ? ` — ${a.issuer}` : ''}</p>)}
        </section>
      )}

      {data.volunteer.length > 0 && (
        <section className="mb-4">
          <h2 className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1">Volunteer Work</h2>
          {data.volunteer.map(v => <p key={v.id}>{String(v.role ?? '')} — {String(v.organisation)}</p>)}
        </section>
      )}

      {data.memberships.length > 0 && (
        <section className="mb-4">
          <h2 className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1">Professional Memberships</h2>
          {data.memberships.map(m => <p key={m.id}>{String(m.institution)}</p>)}
        </section>
      )}

      {data.publications.length > 0 && (
        <section className="mb-4">
          <h2 className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1">Publications</h2>
          {data.publications.map(p => <p key={p.id}>{String(p.title)}</p>)}
        </section>
      )}

      <section>
        <h2 className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1">References</h2>
        {profile.referencesMode === 'available_on_request' || data.references.length === 0 ? (
          <p>Available on request</p>
        ) : (
          data.references.map(r => (
            <p key={r.id}>{String(r.name)}{r.company ? `, ${r.company}` : ''}</p>
          ))
        )}
      </section>
    </div>
  )
}
