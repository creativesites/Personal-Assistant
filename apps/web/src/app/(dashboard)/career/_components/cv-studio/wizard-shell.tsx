'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Eye, EyeOff, ArrowLeft, Download, Loader2 } from 'lucide-react'
import { apiClient, ApiError } from '@/lib/api'
import { useToast } from '@/components/ui'
import { useCareerProfile } from './use-career-profile'
import { PersonalDetailsStep } from './personal-details-step'
import { SummaryStep, ObjectivesStep } from './summary-objectives-step'
import { EntryListEditor } from './entry-list-editor'
import { ProjectsStep, type ProjectLink } from './projects-step'
import { ReferencesStep } from './references-step'
import { AdditionalInfoStep } from './additional-info-step'
import { CvPreview } from './cv-preview'
import { CvHealthPanel } from './cv-health-panel'

// CV Studio Phase 4 — The Wizard (docs/CV_STUDIO_PLAN.md §4, §18 Phase 4).
// Autosave on every field blur, one section per step, live preview beside
// it on desktop — no "Save"/"Generate" button anywhere in the flow (§9).
// Eight of the fourteen steps are the shared EntryListEditor configured per
// resource; the remaining six (Personal Details, Summary, Objectives,
// Projects, References, Additional Info) are bespoke since they touch
// career_profiles directly or need a picker over another resource.

const STEPS = [
  'Personal Details', 'Professional Summary', 'Career Objectives', 'Employment History',
  'Education', 'Certifications', 'Skills', 'Projects', 'Awards', 'Volunteer Work',
  'Professional Memberships', 'Publications', 'References', 'Additional Information',
] as const

// CV Studio Phase 5 (docs/CV_STUDIO_PLAN.md §5) — the four templates the
// on-demand PDF render picks from. The live preview below stays a single,
// plain HTML mirror regardless of which is selected (§9's own documented
// simplification) — only the downloaded PDF actually looks different per
// template.
const TEMPLATES = [
  { key: 'professional', label: 'Professional' },
  { key: 'modern', label: 'Modern' },
  { key: 'executive', label: 'Executive' },
  { key: 'creative', label: 'Creative' },
] as const

export function WizardShell({
  cvId, token, initialProjectLinks, initialTemplateKey,
}: {
  cvId: string
  token: string
  initialProjectLinks: ProjectLink[]
  initialTemplateKey: string
}) {
  const { addToast } = useToast()
  const { profile, updateField } = useCareerProfile(token)
  const [step, setStep] = useState(0)
  const [showPreview, setShowPreview] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [projectLinks, setProjectLinks] = useState<ProjectLink[]>(initialProjectLinks)
  const [templateKey, setTemplateKey] = useState(initialTemplateKey)
  const [downloading, setDownloading] = useState(false)

  const changeTemplate = async (key: string) => {
    setTemplateKey(key)
    try {
      await apiClient(`/api/career/cvs/${cvId}`, { method: 'PATCH', token, body: JSON.stringify({ templateKey: key }) })
    } catch (err) {
      addToast({ variant: 'error', title: 'Could not change template', description: err instanceof ApiError ? err.message : undefined })
    }
  }

  const downloadPdf = async () => {
    setDownloading(true)
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'
      const res = await fetch(`${apiUrl}/api/career/cvs/${cvId}/pdf`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error('Download failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'cv.pdf'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      addToast({ variant: 'error', title: 'Failed to download PDF' })
    } finally {
      setDownloading(false)
    }
  }

  const bumpRefresh = useCallback(() => setRefreshKey(k => k + 1), [])

  const renderStep = () => {
    if (!profile) return <p className="text-sm text-gray-500">Loading...</p>
    switch (step) {
      case 0: return <PersonalDetailsStep profile={profile} updateField={updateField} />
      case 1: return <SummaryStep profile={profile} token={token} updateField={updateField} />
      case 2: return <ObjectivesStep profile={profile} token={token} updateField={updateField} />
      case 3: return (
        <EntryListEditor
          resourcePath="employment-history" token={token} onMutated={bumpRefresh}
          titleFields={['title', 'employer']} addLabel="Add employment" emptyLabel="No employment history yet."
          fields={[
            { key: 'title', label: 'Job title', type: 'text', required: true },
            { key: 'employer', label: 'Employer', type: 'text', required: true },
            { key: 'location', label: 'Location', type: 'text' },
            { key: 'employmentType', label: 'Employment type', type: 'select', options: ['full_time', 'part_time', 'contract', 'internship', 'freelance', 'volunteer'] },
            { key: 'startDate', label: 'Start date', type: 'date' },
            { key: 'endDate', label: 'End date', type: 'date' },
            { key: 'isCurrent', label: 'Currently working here', type: 'boolean' },
            { key: 'responsibilities', label: 'Responsibilities', type: 'textarea' },
            { key: 'achievements', label: 'Achievements', type: 'array', placeholder: 'Key achievements' },
            { key: 'technologies', label: 'Technologies', type: 'array' },
            { key: 'managerName', label: 'Manager name', type: 'text' },
            { key: 'referenceAvailable', label: 'Reference available', type: 'boolean' },
            { key: 'reasonForLeaving', label: 'Reason for leaving (private, never shown on CV)', type: 'textarea' },
          ]}
        />
      )
      case 4: return (
        <EntryListEditor
          resourcePath="education" token={token} onMutated={bumpRefresh}
          titleFields={['qualification', 'institution']} addLabel="Add education" emptyLabel="No education entries yet."
          fields={[
            { key: 'institution', label: 'Institution', type: 'text', required: true },
            { key: 'qualification', label: 'Qualification', type: 'text' },
            { key: 'programme', label: 'Programme / field of study', type: 'text' },
            { key: 'startDate', label: 'Start date', type: 'date' },
            { key: 'endDate', label: 'End date', type: 'date' },
            { key: 'grade', label: 'Grade', type: 'text' },
            { key: 'awards', label: 'Awards', type: 'textarea' },
            { key: 'relevantModules', label: 'Relevant modules', type: 'array' },
          ]}
        />
      )
      case 5: return (
        <EntryListEditor
          resourcePath="certifications" token={token} onMutated={bumpRefresh}
          titleFields={['name', 'issuer']} addLabel="Add certification" emptyLabel="No certifications yet."
          fields={[
            { key: 'name', label: 'Certification', type: 'text', required: true },
            { key: 'issuer', label: 'Issuer', type: 'text' },
            { key: 'issuedDate', label: 'Issued date', type: 'date' },
            { key: 'expiryDate', label: 'Expiry date', type: 'date' },
            { key: 'credentialId', label: 'Credential ID', type: 'text' },
            { key: 'url', label: 'URL', type: 'text' },
          ]}
        />
      )
      case 6: return (
        <EntryListEditor
          resourcePath="skill-groups" token={token} onMutated={bumpRefresh}
          titleFields={['groupName']} addLabel="Add skill group" emptyLabel="No skill groups yet."
          fields={[
            { key: 'groupName', label: 'Group name', type: 'text', required: true, placeholder: 'e.g. Programming, Soft Skills' },
            { key: 'skills', label: 'Skills', type: 'array' },
          ]}
        />
      )
      case 7: return (
        <ProjectsStep cvId={cvId} token={token} projectLinks={projectLinks} onProjectLinksChange={links => { setProjectLinks(links); bumpRefresh() }} />
      )
      case 8: return (
        <EntryListEditor
          resourcePath="awards" token={token} onMutated={bumpRefresh}
          titleFields={['title', 'issuer']} addLabel="Add award" emptyLabel="No awards yet."
          fields={[
            { key: 'title', label: 'Award', type: 'text', required: true },
            { key: 'issuer', label: 'Issuer', type: 'text' },
            { key: 'awardDate', label: 'Date', type: 'date' },
            { key: 'description', label: 'Description', type: 'textarea' },
          ]}
        />
      )
      case 9: return (
        <EntryListEditor
          resourcePath="volunteer-work" token={token} onMutated={bumpRefresh}
          titleFields={['role', 'organisation']} addLabel="Add volunteer work" emptyLabel="No volunteer work yet."
          fields={[
            { key: 'organisation', label: 'Organisation', type: 'text', required: true },
            { key: 'role', label: 'Role', type: 'text' },
            { key: 'startDate', label: 'Start date', type: 'date' },
            { key: 'endDate', label: 'End date', type: 'date' },
            { key: 'description', label: 'Description', type: 'textarea' },
          ]}
        />
      )
      case 10: return (
        <EntryListEditor
          resourcePath="memberships" token={token} onMutated={bumpRefresh}
          titleFields={['institution']} addLabel="Add membership" emptyLabel="No professional memberships yet."
          fields={[
            { key: 'institution', label: 'Institution / body', type: 'text', required: true, placeholder: 'e.g. Engineering Institution of Zambia' },
            { key: 'membershipNumber', label: 'Membership number', type: 'text' },
            { key: 'sinceDate', label: 'Member since', type: 'date' },
          ]}
        />
      )
      case 11: return (
        <EntryListEditor
          resourcePath="publications" token={token} onMutated={bumpRefresh}
          titleFields={['title']} addLabel="Add publication" emptyLabel="No publications yet."
          fields={[
            { key: 'title', label: 'Title', type: 'text', required: true },
            { key: 'publisher', label: 'Publisher', type: 'text' },
            { key: 'publicationDate', label: 'Date', type: 'date' },
            { key: 'url', label: 'URL', type: 'text' },
            { key: 'coAuthors', label: 'Co-authors', type: 'array' },
          ]}
        />
      )
      case 12: return <ReferencesStep profile={profile} token={token} updateField={updateField} onMutated={bumpRefresh} />
      case 13: return <AdditionalInfoStep profile={profile} updateField={updateField} />
      default: return null
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <Link href="/career/cv-studio" className="inline-flex items-center gap-1 text-sm font-semibold text-gray-500 hover:text-gray-700">
          <ArrowLeft className="w-4 h-4" />Back to CVs
        </Link>
        <div className="flex items-center gap-2">
          <select
            value={templateKey}
            onChange={e => changeTemplate(e.target.value)}
            className="rounded-xl border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700"
          >
            {TEMPLATES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
          <button
            onClick={downloadPdf}
            disabled={downloading}
            className="inline-flex items-center gap-1.5 rounded-2xl bg-slate-950 text-white px-3 py-1.5 text-xs font-bold shadow-sm disabled:opacity-60"
          >
            {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            PDF
          </button>
          <button
            onClick={() => setShowPreview(v => !v)}
            className="lg:hidden inline-flex items-center gap-1.5 rounded-2xl bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm"
          >
            {showPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {showPreview ? 'Hide preview' : 'Preview'}
          </button>
        </div>
      </div>

      {/* Mobile: horizontal step strip */}
      <div className="lg:hidden overflow-x-auto -mx-4 px-4 pb-2 mb-4">
        <div className="flex gap-2 w-max">
          {STEPS.map((label, i) => (
            <button
              key={label}
              onClick={() => setStep(i)}
              className={`inline-flex min-h-9 items-center rounded-2xl px-3 text-xs font-bold whitespace-nowrap ${
                i === step ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-slate-600 ring-1 ring-slate-200'
              }`}
            >
              {i + 1}. {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr_1fr] gap-6">
        {/* Desktop: vertical step nav */}
        <div className="hidden lg:block sticky top-6 self-start rounded-3xl border border-slate-200 bg-white p-2 shadow-sm">
          {STEPS.map((label, i) => (
            <button
              key={label}
              onClick={() => setStep(i)}
              className={`w-full text-left rounded-2xl px-3 py-2 text-xs font-semibold mb-0.5 ${
                i === step ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {i + 1}. {label}
            </button>
          ))}
        </div>

        <div className={`${showPreview ? 'hidden lg:block' : ''} rounded-[1.75rem] border border-gray-100 bg-white shadow-sm shadow-gray-200/70 p-5`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-gray-900">{step + 1}. {STEPS[step]}</h2>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setStep(s => Math.max(0, s - 1))}
                disabled={step === 0}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 disabled:opacity-30"
              ><ChevronLeft className="w-4 h-4" /></button>
              <button
                onClick={() => setStep(s => Math.min(STEPS.length - 1, s + 1))}
                disabled={step === STEPS.length - 1}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 disabled:opacity-30"
              ><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
          {renderStep()}
        </div>

        <div className={`${showPreview ? '' : 'hidden lg:block'}`}>
          <CvPreview token={token} profile={profile} projectLinks={projectLinks} refreshKey={refreshKey} />
          <CvHealthPanel cvId={cvId} token={token} refreshKey={refreshKey} />
        </div>
      </div>
    </div>
  )
}
