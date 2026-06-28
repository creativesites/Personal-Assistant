'use client'

import { forwardRef, SelectHTMLAttributes } from 'react'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface SelectGroup {
  label: string
  options: SelectOption[]
}

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  label?: string
  error?: string
  helper?: string
  options?: SelectOption[]
  groups?: SelectGroup[]
  placeholder?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, helper, options, groups, placeholder, className = '', id, ...props }, ref) => {
    const fieldId = id ?? (label ? `field-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined)
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={fieldId} className="block text-sm font-medium text-gray-700 mb-1.5">
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={fieldId}
            className={`block w-full rounded-lg border px-3 py-2 text-sm text-gray-900 bg-white transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed appearance-none pr-8 ${error ? 'border-red-400 focus:ring-red-500 focus:border-red-500' : 'border-gray-300'} ${className}`}
            aria-invalid={error ? true : undefined}
            {...props}
          >
            {placeholder && (
              <option value="" disabled>{placeholder}</option>
            )}
            {options?.map(opt => (
              <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                {opt.label}
              </option>
            ))}
            {groups?.map(group => (
              <optgroup key={group.label} label={group.label}>
                {group.options.map(opt => (
                  <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                    {opt.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5" aria-hidden="true">
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
        {error && (
          <p className="mt-1.5 text-xs text-red-600" role="alert">{error}</p>
        )}
        {!error && helper && (
          <p className="mt-1.5 text-xs text-gray-500">{helper}</p>
        )}
      </div>
    )
  }
)
Select.displayName = 'Select'
