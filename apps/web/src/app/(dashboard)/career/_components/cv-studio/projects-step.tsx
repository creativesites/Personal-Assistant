'use client'

import { useEffect, useState } from 'react'
import { apiClient, ApiError } from '@/lib/api'
import { useToast } from '@/components/ui'

// CV Studio §4 Step 8 — Projects. "One of Zuri's biggest advantages":
// checkbox-select existing projects instead of typing them again.
// Imports description/dates live via the join (career_cv_project_links),
// never copies project data — editing the source project once updates
// every CV that references it.

interface Project {
  id: string
  title: string
  description?: string | null
}

export interface ProjectLink {
  projectId: string
  sortOrder: number
  customDescriptionOverride: string | null
  projectTitle?: string
}

export function ProjectsStep({
  cvId, token, projectLinks, onProjectLinksChange,
}: {
  cvId: string
  token: string
  projectLinks: ProjectLink[]
  onProjectLinksChange: (links: ProjectLink[]) => void
}) {
  const { addToast } = useToast()
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    apiClient<{ projects: Project[] }>('/api/projects', { token }).then(d => setProjects(d.projects)).catch(() => setProjects([]))
  }, [token])

  const selectedIds = new Set(projectLinks.map(l => l.projectId))

  const toggle = async (project: Project) => {
    const nextLinks = selectedIds.has(project.id)
      ? projectLinks.filter(l => l.projectId !== project.id)
      : [...projectLinks, { projectId: project.id, sortOrder: projectLinks.length, customDescriptionOverride: null, projectTitle: project.title }]

    setSaving(true)
    try {
      const result = await apiClient<{ projectLinks: ProjectLink[] }>(`/api/career/cvs/${cvId}/project-links`, {
        method: 'PUT', token,
        body: JSON.stringify({
          projectLinks: nextLinks.map((l, i) => ({ projectId: l.projectId, sortOrder: i, customDescriptionOverride: l.customDescriptionOverride })),
        }),
      })
      onProjectLinksChange(result.projectLinks)
    } catch (err) {
      addToast({ variant: 'error', title: 'Could not update project selection', description: err instanceof ApiError ? err.message : undefined })
    } finally {
      setSaving(false)
    }
  }

  if (projects === null) return <p className="text-sm text-gray-500">Loading your projects...</p>

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">Pick which of your existing projects to feature on this CV. Edit the project itself to update its description everywhere it's referenced.</p>
      {projects.length === 0 ? (
        <p className="text-sm text-gray-500 italic">No projects yet — create one on the Projects page first.</p>
      ) : (
        <div className="space-y-2">
          {projects.map(p => (
            <label key={p.id} className="flex items-start gap-3 rounded-xl border border-gray-100 bg-white p-3 shadow-sm shadow-gray-200/70">
              <input
                type="checkbox"
                checked={selectedIds.has(p.id)}
                disabled={saving}
                onChange={() => toggle(p)}
                className="mt-0.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <div>
                <p className="text-sm font-semibold text-gray-900">{p.title}</p>
                {p.description && <p className="text-xs text-gray-500 mt-0.5">{p.description}</p>}
              </div>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
