'use client'

import React, { useState } from 'react'
import {
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Save,
  CheckCircle2,
  DollarSign,
  MapPin,
  Briefcase,
  Target,
  Sparkles,
  Zap,
} from 'lucide-react'

interface CareerPreferencesBarProps {
  initialProfile?: any
  onSave: (updatedProfile: any) => Promise<void>
}

export function CareerPreferencesBar({ initialProfile, onSave }: CareerPreferencesBarProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedSuccess, setSavedSuccess] = useState(false)

  const [targetTitle, setTargetTitle] = useState(initialProfile?.targetRole || initialProfile?.title || 'Senior Full Stack Engineer')
  const [targetSalary, setTargetSalary] = useState(initialProfile?.salaryExpectationCents ? initialProfile.salaryExpectationCents / 100 : 120000)
  const [currency, setCurrency] = useState(initialProfile?.currency || 'USD')
  const [location, setLocation] = useState(initialProfile?.location || 'Remote / Hybrid')
  const [remotePreference, setRemotePreference] = useState(initialProfile?.remotePreference || 'remote_first')
  const [employmentType, setEmploymentType] = useState(initialProfile?.employmentType || 'full_time')
  const [seniorityLevel, setSeniorityLevel] = useState(initialProfile?.seniorityLevel || 'senior')
  const [availability, setAvailability] = useState(initialProfile?.availability || '2_weeks')
  const [skills, setSkills] = useState<string[]>(
    Array.isArray(initialProfile?.skills)
      ? initialProfile.skills.map((s: any) => (typeof s === 'string' ? s : s.name))
      : ['React', 'TypeScript', 'Node.js', 'Next.js', 'PostgreSQL', 'TailwindCSS', 'Python', 'AI Integration']
  )
  const [newSkill, setNewSkill] = useState('')

  const handleAddSkill = (e: React.FormEvent) => {
    e.preventDefault()
    if (newSkill.trim() && !skills.includes(newSkill.trim())) {
      setSkills([...skills, newSkill.trim()])
      setNewSkill('')
    }
  }

  const handleRemoveSkill = (skillToRemove: string) => {
    setSkills(skills.filter((s) => s !== skillToRemove))
  }

  const handleSave = async () => {
    setSaving(true)
    setSavedSuccess(false)
    try {
      await onSave({
        targetRole: targetTitle,
        salaryExpectationCents: targetSalary * 100,
        currency,
        location,
        remotePreference,
        employmentType,
        seniorityLevel,
        availability,
        skills,
      })
      setSavedSuccess(true)
      setTimeout(() => setSavedSuccess(false), 3000)
    } catch (err) {
      console.error('Failed to save preferences', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-sm overflow-hidden transition-all mb-6">
      {/* Docked Summary Header */}
      <div className="p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 bg-gradient-to-r from-indigo-50/50 via-purple-50/30 to-white dark:from-indigo-950/20 dark:via-purple-950/10 dark:to-gray-900">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-600/10 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400 rounded-xl">
            <SlidersHorizontal className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-gray-900 dark:text-white text-base">Active Career Search Parameters</h3>
              <span className="px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 rounded-full flex items-center gap-1">
                <Zap className="w-3 h-3" /> Live Matching
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {targetTitle} • {currency} ${targetSalary.toLocaleString()} • {remotePreference.replace('_', ' ')} • {skills.length} target skills
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {savedSuccess && (
            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1 animate-pulse">
              <CheckCircle2 className="w-4 h-4" /> Preferences Updated
            </span>
          )}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="px-3.5 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xs hover:border-indigo-300 dark:hover:border-indigo-600 transition flex items-center gap-1.5"
          >
            {isOpen ? 'Close Controls' : 'Edit Preferences'}
            {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expandable In-Place Editor Panel */}
      {isOpen && (
        <div className="p-5 sm:p-6 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 space-y-5 animate-in fade-in duration-200">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Target Role */}
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1">
                <Briefcase className="w-3.5 h-3.5 text-indigo-500" /> Target Job Title
              </label>
              <input
                type="text"
                value={targetTitle}
                onChange={(e) => setTargetTitle(e.target.value)}
                className="w-full px-3 py-2 text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                placeholder="e.g. Senior Full Stack Engineer"
              />
            </div>

            {/* Target Salary */}
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5 text-emerald-500" /> Target Annual Salary
              </label>
              <div className="flex gap-2">
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="px-2.5 py-2 text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                >
                  <option value="USD" className="text-gray-900 dark:text-white bg-white dark:bg-gray-800">USD ($)</option>
                  <option value="EUR" className="text-gray-900 dark:text-white bg-white dark:bg-gray-800">EUR (€)</option>
                  <option value="GBP" className="text-gray-900 dark:text-white bg-white dark:bg-gray-800">GBP (£)</option>
                  <option value="CAD" className="text-gray-900 dark:text-white bg-white dark:bg-gray-800">CAD ($)</option>
                </select>
                <input
                  type="number"
                  value={targetSalary}
                  onChange={(e) => setTargetSalary(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                />
              </div>
            </div>

            {/* Location & Remote */}
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-rose-500" /> Location & Remote Setup
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full px-3 py-2 text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  placeholder="e.g. London / Remote"
                />
                <select
                  value={remotePreference}
                  onChange={(e) => setRemotePreference(e.target.value)}
                  className="px-2.5 py-2 text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                >
                  <option value="remote_first" className="text-gray-900 dark:text-white bg-white dark:bg-gray-800">Remote First</option>
                  <option value="hybrid" className="text-gray-900 dark:text-white bg-white dark:bg-gray-800">Hybrid</option>
                  <option value="on_site" className="text-gray-900 dark:text-white bg-white dark:bg-gray-800">On-site</option>
                  <option value="any" className="text-gray-900 dark:text-white bg-white dark:bg-gray-800">Any Setup</option>
                </select>
              </div>
            </div>

            {/* Employment Type */}
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Employment Type</label>
              <select
                value={employmentType}
                onChange={(e) => setEmploymentType(e.target.value)}
                className="w-full px-3 py-2 text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
              >
                <option value="full_time" className="text-gray-900 dark:text-white bg-white dark:bg-gray-800">Full-Time Permanent</option>
                <option value="contract" className="text-gray-900 dark:text-white bg-white dark:bg-gray-800">Contract / Consulting</option>
                <option value="freelance" className="text-gray-900 dark:text-white bg-white dark:bg-gray-800">Freelance</option>
                <option value="part_time" className="text-gray-900 dark:text-white bg-white dark:bg-gray-800">Part-Time</option>
              </select>
            </div>

            {/* Seniority */}
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Seniority Level</label>
              <select
                value={seniorityLevel}
                onChange={(e) => setSeniorityLevel(e.target.value)}
                className="w-full px-3 py-2 text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
              >
                <option value="junior" className="text-gray-900 dark:text-white bg-white dark:bg-gray-800">Junior (0-2 yrs)</option>
                <option value="mid" className="text-gray-900 dark:text-white bg-white dark:bg-gray-800">Mid-Level (3-5 yrs)</option>
                <option value="senior" className="text-gray-900 dark:text-white bg-white dark:bg-gray-800">Senior (5-8 yrs)</option>
                <option value="lead" className="text-gray-900 dark:text-white bg-white dark:bg-gray-800">Lead / Principal (8+ yrs)</option>
                <option value="executive" className="text-gray-900 dark:text-white bg-white dark:bg-gray-800">Executive / VP</option>
              </select>
            </div>

            {/* Availability */}
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Availability</label>
              <select
                value={availability}
                onChange={(e) => setAvailability(e.target.value)}
                className="w-full px-3 py-2 text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
              >
                <option value="immediate" className="text-gray-900 dark:text-white bg-white dark:bg-gray-800">Immediate Start</option>
                <option value="2_weeks" className="text-gray-900 dark:text-white bg-white dark:bg-gray-800">2 Weeks Notice</option>
                <option value="1_month" className="text-gray-900 dark:text-white bg-white dark:bg-gray-800">1 Month Notice</option>
                <option value="exploring" className="text-gray-900 dark:text-white bg-white dark:bg-gray-800">Just Exploring</option>
              </select>
            </div>
          </div>

          {/* Core Skills Tags */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Target className="w-3.5 h-3.5 text-indigo-500" /> Key Skills & Technologies
              </span>
              <span className="text-gray-400 text-[11px]">{skills.length} skills selected</span>
            </label>
            <div className="flex flex-wrap items-center gap-1.5 p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl min-h-[44px]">
              {skills.map((skill) => (
                <span
                  key={skill}
                  className="px-2.5 py-1 text-xs font-medium bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60 rounded-lg flex items-center gap-1.5"
                >
                  {skill}
                  <button
                    onClick={() => handleRemoveSkill(skill)}
                    className="hover:text-red-500 transition focus:outline-hidden"
                  >
                    ×
                  </button>
                </span>
              ))}
              <form onSubmit={handleAddSkill} className="inline-flex">
                <input
                  type="text"
                  value={newSkill}
                  onChange={(e) => setNewSkill(e.target.value)}
                  placeholder="+ Add skill..."
                  className="text-xs bg-transparent border-none focus:outline-hidden px-2 py-0.5 text-gray-900 dark:text-white placeholder-gray-400"
                />
              </form>
            </div>
          </div>

          {/* Action Footer */}
          <div className="flex items-center justify-between pt-2 border-t border-gray-200/60 dark:border-gray-800">
            <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-purple-500" />
              Saving immediately recalculates match percentages & refreshes recommended opportunities.
            </p>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-xl shadow-xs transition flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Saving...' : 'Save & Refresh Feed'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
