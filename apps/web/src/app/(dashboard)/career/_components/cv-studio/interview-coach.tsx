'use client'

import { useState } from 'react'
import { MessageSquare, Wand2, Send, CheckCircle2, Sparkles, HelpCircle, Award, Loader2 } from 'lucide-react'

interface Question {
  id: string
  type: string
  question: string
  starGuide: {
    situation: string
    task: string
    action: string
    result: string
  }
}

interface Evaluation {
  score: number
  feedback: string
  strengths: string[]
  improvements: string[]
}

export function InterviewCoach({ token }: { token: string }) {
  const [roleTitle, setRoleTitle] = useState('Senior Full-Stack Engineer')
  const [loadingQuestions, setLoadingQuestions] = useState(false)
  const [questions, setQuestions] = useState<Question[]>([])
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0)

  // Candidate practice answer
  const [answerText, setAnswerText] = useState('')
  const [evaluating, setEvaluating] = useState(false)
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null)

  const handleGenerateQuestions = async () => {
    setLoadingQuestions(true)
    setEvaluation(null)
    try {
      const res = await fetch('/api/career/ai-suite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate_interview_questions',
          roleTitle,
        }),
      })
      const d = await res.json()
      if (d.questions) {
        setQuestions(d.questions)
        setActiveQuestionIndex(0)
      }
    } catch {
      // fallback
    } finally {
      setLoadingQuestions(false)
    }
  }

  const handleEvaluateAnswer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!answerText.trim() || !currentQ) return

    setEvaluating(true)
    try {
      const res = await fetch('/api/career/ai-suite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'evaluate_answer',
          questionText: currentQ.question,
          userResponse: answerText,
        }),
      })
      const d = await res.json()
      if (d.evaluation) setEvaluation(d.evaluation)
    } catch {
      // fallback
    } finally {
      setEvaluating(false)
    }
  }

  const currentQ = questions[activeQuestionIndex]

  return (
    <div className="space-y-6">
      {/* Role Selection */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2 text-indigo-900">
          <MessageSquare className="w-5 h-5 text-indigo-600" />
          <h2 className="text-sm font-bold">AI Interview Practice Coach</h2>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-2">
          <input
            type="text"
            value={roleTitle}
            onChange={(e) => setRoleTitle(e.target.value)}
            placeholder="Target role for interview practice..."
            className="flex-1 w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
          />
          <button
            type="button"
            onClick={handleGenerateQuestions}
            disabled={loadingQuestions}
            className="w-full sm:w-auto px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center justify-center gap-1.5 whitespace-nowrap"
          >
            {loadingQuestions ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-3.5 h-3.5 text-amber-400" />}
            <span>Generate Interview Questions</span>
          </button>
        </div>
      </div>

      {/* Active Question Simulator */}
      {currentQ && (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
          {/* Question Index Tabs */}
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">
              Question {activeQuestionIndex + 1} of {questions.length} ({currentQ.type})
            </span>
            <div className="flex items-center gap-1">
              {questions.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setActiveQuestionIndex(idx)
                    setEvaluation(null)
                    setAnswerText('')
                  }}
                  className={`w-6 h-6 rounded-full text-xs font-bold transition-all ${
                    activeQuestionIndex === idx
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {idx + 1}
                </button>
              ))}
            </div>
          </div>

          <h3 className="text-base font-bold text-slate-900 leading-snug">{currentQ.question}</h3>

          {/* STAR Guide Framework */}
          <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200/80 space-y-2 text-xs">
            <div className="flex items-center gap-1.5 text-amber-900 font-bold">
              <Sparkles className="w-4 h-4 text-amber-600" />
              <span>STAR Method Guide</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-700">
              <p><strong>S (Situation):</strong> {currentQ.starGuide.situation}</p>
              <p><strong>T (Task):</strong> {currentQ.starGuide.task}</p>
              <p><strong>A (Action):</strong> {currentQ.starGuide.action}</p>
              <p><strong>R (Result):</strong> {currentQ.starGuide.result}</p>
            </div>
          </div>

          {/* Practice Answer Form */}
          <form onSubmit={handleEvaluateAnswer} className="space-y-3">
            <textarea
              rows={4}
              required
              placeholder="Type your practice response here..."
              value={answerText}
              onChange={(e) => setAnswerText(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-900 focus:outline-none focus:border-indigo-500 resize-none"
            />

            <button
              type="submit"
              disabled={evaluating}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center justify-center gap-1.5"
            >
              {evaluating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              <span>Submit for AI Evaluation</span>
            </button>
          </form>

          {/* AI Feedback Results */}
          {evaluation && (
            <div className="p-5 rounded-2xl bg-slate-900 text-white space-y-3 shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-400 flex items-center gap-1">
                  <Award className="w-4 h-4" />
                  AI Coach Score
                </span>
                <span className="text-lg font-black text-emerald-400">{evaluation.score} / 100</span>
              </div>

              <p className="text-xs text-slate-200">{evaluation.feedback}</p>

              <div className="space-y-1 text-xs">
                <span className="font-bold text-emerald-400 block">Key Strengths:</span>
                {evaluation.strengths.map((s, i) => (
                  <p key={i} className="text-slate-300">✓ {s}</p>
                ))}
              </div>

              <div className="space-y-1 text-xs">
                <span className="font-bold text-amber-400 block">Areas for Growth:</span>
                {evaluation.improvements.map((imp, i) => (
                  <p key={i} className="text-slate-300">💡 {imp}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
