'use client'

import { useEffect, useState } from 'react'
import { apiClient } from '@/lib/api'
import type { CareerProfile } from './use-career-profile'
import type { CvTemplateKey, CvDensityMode } from './template-toolbar'

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
  token,
  profile,
  projectLinks,
  refreshKey,
  templateKey = 'modern',
  densityMode = 'comfortable',
  showPageBreaks = true,
  isEditable = true,
  onUpdateProfileField,
}: {
  token: string
  profile: CareerProfile | null
  projectLinks: { projectId: string; projectTitle?: string; customDescriptionOverride?: string | null }[]
  refreshKey: number
  templateKey?: CvTemplateKey
  densityMode?: CvDensityMode
  showPageBreaks?: boolean
  isEditable?: boolean
  onUpdateProfileField?: (field: keyof CareerProfile, value: any) => void
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

  // Density styles
  const densityStyles = {
    comfortable: {
      padding: 'p-8',
      fontSize: 'text-[13px]',
      leading: 'leading-relaxed',
      sectionSpacing: 'mb-4',
      itemSpacing: 'mb-2.5',
      headingSize: 'text-[11px]',
    },
    compact: {
      padding: 'p-6',
      fontSize: 'text-[12px]',
      leading: 'leading-snug',
      sectionSpacing: 'mb-3',
      itemSpacing: 'mb-2',
      headingSize: 'text-[10px]',
    },
    'fit-1-page': {
      padding: 'p-5',
      fontSize: 'text-[11px]',
      leading: 'leading-tight',
      sectionSpacing: 'mb-2',
      itemSpacing: 'mb-1.5',
      headingSize: 'text-[10px]',
    },
  }[densityMode]

  // Template typography & colors
  const isExecutive = templateKey === 'executive'
  const isTech = templateKey === 'tech'

  const fontClass = isExecutive
    ? 'font-serif text-slate-900'
    : isTech
    ? 'font-sans text-slate-900'
    : 'font-sans text-slate-800'

  const headingClass = isExecutive
    ? `${densityStyles.headingSize} font-bold uppercase tracking-wider text-slate-900 border-b border-slate-300 pb-0.5 mb-1.5`
    : isTech
    ? `${densityStyles.headingSize} font-black uppercase tracking-wider text-indigo-700 mb-1 border-l-2 border-indigo-600 pl-2`
    : `${densityStyles.headingSize} font-bold uppercase tracking-wide text-indigo-600 mb-1`

  const editableHover = isEditable
    ? 'hover:outline hover:outline-2 hover:outline-indigo-400 hover:outline-dashed rounded px-0.5 transition-all cursor-text'
    : ''

  return (
    <div className="relative">
      <div
        className={`bg-white rounded-2xl shadow-sm border border-slate-200/90 ${densityStyles.padding} ${densityStyles.fontSize} ${densityStyles.leading} ${fontClass}`}
      >
        {/* Header */}
        <div className={`text-center border-b border-slate-200 ${densityStyles.sectionSpacing} pb-3`}>
          <h1
            contentEditable={isEditable}
            suppressContentEditableWarning
            onBlur={(e) => onUpdateProfileField?.('fullName', e.currentTarget.textContent || '')}
            className={`text-2xl font-black text-slate-950 tracking-tight ${editableHover}`}
            title={isEditable ? 'Click to edit Full Name directly' : undefined}
          >
            {profile.fullName || 'Your Full Name'}
          </h1>

          <p
            contentEditable={isEditable}
            suppressContentEditableWarning
            onBlur={(e) => onUpdateProfileField?.('headline', e.currentTarget.textContent || '')}
            className={`text-xs font-semibold text-slate-700 mt-0.5 ${editableHover}`}
            title={isEditable ? 'Click to edit Professional Title' : undefined}
          >
            {profile.headline || 'Your Professional Title'}
          </p>

          {contactLine && <p className="text-[11px] text-slate-500 mt-1">{contactLine}</p>}
        </div>

        {/* Summary */}
        <section className={densityStyles.sectionSpacing}>
          <h2 className={headingClass}>Summary</h2>
          <p
            contentEditable={isEditable}
            suppressContentEditableWarning
            onBlur={(e) => onUpdateProfileField?.('summary', e.currentTarget.textContent || '')}
            className={`text-slate-800 ${editableHover}`}
            title={isEditable ? 'Click to edit Summary inline' : undefined}
          >
            {profile.summary || 'Click here to write your professional summary...'}
          </p>
        </section>

        {/* Employment */}
        {data.employment.length > 0 && (
          <section className={densityStyles.sectionSpacing}>
            <h2 className={headingClass}>Employment History</h2>
            {data.employment.map((e) => (
              <div key={e.id} className={densityStyles.itemSpacing}>
                <div className="flex justify-between font-bold text-slate-950">
                  <span>{String(e.title)} — {String(e.employer)}</span>
                  <span className="text-slate-500 font-normal">{dateRange(e.startDate, e.endDate, e.isCurrent)}</span>
                </div>
                {!!e.achievements && Array.isArray(e.achievements) && e.achievements.length > 0 && (
                  <ul className="list-disc list-inside mt-0.5 space-y-0.5 text-slate-700">
                    {(e.achievements as string[]).map((a, i) => (
                      <li
                        key={i}
                        contentEditable={isEditable}
                        suppressContentEditableWarning
                        className={editableHover}
                        title={isEditable ? 'Click to edit bullet point inline' : undefined}
                      >
                        {a}
                      </li>
                    ))}
                  </ul>
                )}
                {!e.achievements || (Array.isArray(e.achievements) && e.achievements.length === 0 && e.responsibilities) ? (
                  <p className={`text-slate-700 mt-0.5 ${editableHover}`} contentEditable={isEditable} suppressContentEditableWarning>
                    {String(e.responsibilities ?? '')}
                  </p>
                ) : null}
              </div>
            ))}
          </section>
        )}

        {/* Education */}
        {data.education.length > 0 && (
          <section className={densityStyles.sectionSpacing}>
            <h2 className={headingClass}>Education</h2>
            {data.education.map((e) => (
              <div key={e.id} className="flex justify-between font-medium text-slate-900 mb-1">
                <span>{String(e.qualification ?? '')}{e.programme ? `, ${e.programme}` : ''} — {String(e.institution)}</span>
                <span className="text-slate-500 font-normal">{e.endDate ? String(e.endDate).slice(0, 4) : ''}</span>
              </div>
            ))}
          </section>
        )}

        {/* Certifications */}
        {data.certifications.length > 0 && (
          <section className={densityStyles.sectionSpacing}>
            <h2 className={headingClass}>Certifications</h2>
            {data.certifications.map((c) => (
              <p key={c.id} className="text-slate-800">
                <strong className="text-slate-950">{String(c.name)}</strong>{c.issuer ? ` — ${c.issuer}` : ''}
              </p>
            ))}
          </section>
        )}

        {/* Skills */}
        {data.skillGroups.length > 0 && (
          <section className={densityStyles.sectionSpacing}>
            <h2 className={headingClass}>Skills</h2>
            {isTech ? (
              <div className="flex flex-wrap gap-1.5 mt-1">
                {data.skillGroups.flatMap((g) => (g.skills as string[]) || []).map((skill, idx) => (
                  <span key={idx} className="bg-slate-100 border border-slate-200 text-slate-800 font-semibold px-2 py-0.5 rounded-md text-[10px]">
                    {skill}
                  </span>
                ))}
              </div>
            ) : (
              data.skillGroups.map((g) => (
                <p key={g.id} className="text-slate-800">
                  <strong className="text-slate-950">{String(g.groupName)}:</strong> {(g.skills as string[]).join(', ')}
                </p>
              ))
            )}
          </section>
        )}

        {/* Projects */}
        {projectLinks.length > 0 && (
          <section className={densityStyles.sectionSpacing}>
            <h2 className={headingClass}>Projects</h2>
            {projectLinks.map((p) => (
              <p key={p.projectId} className="text-slate-800 font-medium">
                {p.customDescriptionOverride || p.projectTitle}
              </p>
            ))}
          </section>
        )}

        {/* Awards */}
        {data.awards.length > 0 && (
          <section className={densityStyles.sectionSpacing}>
            <h2 className={headingClass}>Awards</h2>
            {data.awards.map((a) => (
              <p key={a.id} className="text-slate-800">
                <strong className="text-slate-950">{String(a.title)}</strong>{a.issuer ? ` — ${a.issuer}` : ''}
              </p>
            ))}
          </section>
        )}

        {/* Volunteer */}
        {data.volunteer.length > 0 && (
          <section className={densityStyles.sectionSpacing}>
            <h2 className={headingClass}>Volunteer Work</h2>
            {data.volunteer.map((v) => (
              <p key={v.id} className="text-slate-800">
                {String(v.role ?? '')} — {String(v.organisation)}
              </p>
            ))}
          </section>
        )}

        {/* Memberships */}
        {data.memberships.length > 0 && (
          <section className={densityStyles.sectionSpacing}>
            <h2 className={headingClass}>Professional Memberships</h2>
            {data.memberships.map((m) => (
              <p key={m.id} className="text-slate-800">{String(m.institution)}</p>
            ))}
          </section>
        )}

        {/* Publications */}
        {data.publications.length > 0 && (
          <section className={densityStyles.sectionSpacing}>
            <h2 className={headingClass}>Publications</h2>
            {data.publications.map((p) => (
              <p key={p.id} className="text-slate-800">{String(p.title)}</p>
            ))}
          </section>
        )}

        {/* References */}
        <section>
          <h2 className={headingClass}>References</h2>
          {profile.referencesMode === 'available_on_request' || data.references.length === 0 ? (
            <p className="text-slate-700 italic">Available on request</p>
          ) : (
            data.references.map((r) => (
              <p key={r.id} className="text-slate-800">
                {String(r.name)}{r.company ? `, ${r.company}` : ''}
              </p>
            ))
          )}
        </section>
      </div>

      {/* Visual Page Break Line Indicator (A4 Page 1 ~1050px height) */}
      {showPageBreaks && (
        <div className="absolute top-[1050px] inset-x-0 border-b-2 border-dashed border-rose-400 pointer-events-none flex items-center justify-between px-3 py-0.5 bg-rose-50/80 text-[10px] font-bold text-rose-700 z-10 rounded-md shadow-sm">
          <span>📄 Page 1 Boundary (A4/US Letter Limit)</span>
          <span>End of Page 1</span>
        </div>
      )}
    </div>
  )
}
