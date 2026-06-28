'use client'

import { forwardRef, InputHTMLAttributes, TextareaHTMLAttributes } from 'react'

const baseClass =
  'block w-full rounded-lg border px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 bg-white transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-0 focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed'

const normalBorder = 'border-gray-300'
const errorBorder  = 'border-red-400 focus:ring-red-500 focus:border-red-500'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  helper?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helper, className = '', id, ...props }, ref) => {
    const fieldId = id ?? (label ? `field-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined)
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={fieldId} className="block text-sm font-medium text-gray-700 mb-1.5">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={fieldId}
          className={`${baseClass} ${error ? errorBorder : normalBorder} ${className}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${fieldId}-error` : helper ? `${fieldId}-helper` : undefined}
          {...props}
        />
        {error && (
          <p id={`${fieldId}-error`} className="mt-1.5 text-xs text-red-600" role="alert">{error}</p>
        )}
        {!error && helper && (
          <p id={`${fieldId}-helper`} className="mt-1.5 text-xs text-gray-500">{helper}</p>
        )}
      </div>
    )
  }
)
Input.displayName = 'Input'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  helper?: string
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, helper, className = '', id, rows = 4, ...props }, ref) => {
    const fieldId = id ?? (label ? `field-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined)
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={fieldId} className="block text-sm font-medium text-gray-700 mb-1.5">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={fieldId}
          rows={rows}
          className={`${baseClass} ${error ? errorBorder : normalBorder} resize-y ${className}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${fieldId}-error` : helper ? `${fieldId}-helper` : undefined}
          {...props}
        />
        {error && (
          <p id={`${fieldId}-error`} className="mt-1.5 text-xs text-red-600" role="alert">{error}</p>
        )}
        {!error && helper && (
          <p id={`${fieldId}-helper`} className="mt-1.5 text-xs text-gray-500">{helper}</p>
        )}
      </div>
    )
  }
)
Textarea.displayName = 'Textarea'
