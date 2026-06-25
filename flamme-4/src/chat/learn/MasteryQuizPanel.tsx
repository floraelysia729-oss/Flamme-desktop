import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, Loader2, X } from 'lucide-react'
import {
  completeMasteryQuiz,
  evaluateMasteryAnswer,
  startMasteryQuiz,
} from '../../api/bridge'
import { useMasteryQuizStore } from './masteryQuizStore'
import type { LearnNote, MasteryQuestion } from './types'

type Phase = 'loading' | 'question' | 'wrong' | 'passed' | 'error'

interface Props {
  targetLabel: string
  sessionId: string
  learnNote: LearnNote
  onLearnNoteUpdate: (note: LearnNote) => void
  onClose: () => void
}

export default function MasteryQuizPanel({
  targetLabel,
  sessionId,
  learnNote,
  onLearnNoteUpdate,
  onClose,
}: Props) {
  const activeSession = useMasteryQuizStore((s) => s.activeSession)
  const setActiveSession = useMasteryQuizStore((s) => s.setActiveSession)
  const addWrongEntry = useMasteryQuizStore((s) => s.addWrongEntry)
  const markQuestionPassed = useMasteryQuizStore((s) => s.markQuestionPassed)
  const advanceIndex = useMasteryQuizStore((s) => s.advanceIndex)

  const [phase, setPhase] = useState<Phase>('loading')
  const [answer, setAnswer] = useState('')
  const [explanation, setExplanation] = useState('')
  const [busy, setBusy] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const learnNoteRef = useRef(learnNote)
  learnNoteRef.current = learnNote

  const loadQuiz = useCallback(async () => {
    const noteAtStart = learnNoteRef.current
    setPhase('loading')
    setErrorMsg(null)
    try {
      const res = await startMasteryQuiz(sessionId, targetLabel, noteAtStart)
      setActiveSession({
        targetLabel: res.target_label,
        questions: res.questions,
        index: 0,
        passedIds: [],
      })
      setPhase('question')
      setAnswer('')
      setExplanation('')
    } catch (e) {
      setErrorMsg((e as Error).message)
      setPhase('error')
    }
  }, [sessionId, targetLabel, setActiveSession])

  useEffect(() => {
    void loadQuiz()
  }, [sessionId, targetLabel, loadQuiz])

  const currentQuestion: MasteryQuestion | null =
    activeSession && activeSession.questions[activeSession.index]
      ? activeSession.questions[activeSession.index]
      : null

  const total = activeSession?.questions.length ?? 0
  const currentNum = (activeSession?.index ?? 0) + 1

  const handleSubmit = async () => {
    if (!activeSession || !currentQuestion || !answer.trim() || busy) return
    setBusy(true)
    setErrorMsg(null)
    try {
      const res = await evaluateMasteryAnswer(sessionId, {
        target_label: activeSession.targetLabel,
        question_id: currentQuestion.id,
        question: currentQuestion.prompt,
        user_answer: answer.trim(),
        learn_note: learnNoteRef.current,
      })

      if (res.correct) {
        markQuestionPassed(currentQuestion.id)
        const nextPassed = [...activeSession.passedIds, currentQuestion.id]
        const done = activeSession.questions.every((q) => nextPassed.includes(q.id))

        if (done) {
          const completed = await completeMasteryQuiz(
            sessionId,
            activeSession.targetLabel,
            learnNoteRef.current,
          )
          onLearnNoteUpdate(completed.learn_note)
          setPhase('passed')
        } else {
          advanceIndex()
          setAnswer('')
          setExplanation('')
          setPhase('question')
        }
      } else {
        const entry = res.wrong_entry
          ? {
              id: res.wrong_entry.id,
              targetLabel: res.wrong_entry.targetLabel,
              question: res.wrong_entry.question,
              userAnswer: res.wrong_entry.userAnswer,
              explanation: res.wrong_entry.explanation,
              at: res.wrong_entry.at,
            }
          : {
              id: crypto.randomUUID(),
              targetLabel: activeSession.targetLabel,
              question: currentQuestion.prompt,
              userAnswer: answer.trim(),
              explanation: res.explanation,
              at: new Date().toISOString(),
            }
        addWrongEntry(entry)
        setExplanation(res.explanation)
        setPhase('wrong')
      }
    } catch (e) {
      setErrorMsg((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const explanationTitle = explanation.startsWith('参考答案') ? '参考答案' : '解析'

  return (
    <div className="mastery-quiz-overlay absolute inset-0 z-20 flex flex-col bg-[var(--glass-bg,var(--bg))]/95 backdrop-blur-sm">
      <header className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-[var(--border)]/40">
        <span className="text-xs font-medium flex-1 truncate">掌握测验 · {targetLabel}</span>
        <button
          type="button"
          className="p-1 rounded hover:bg-white/10"
          onClick={onClose}
          aria-label="关闭测验"
        >
          <X size={14} />
        </button>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        {phase === 'loading' && (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-xs opacity-70">
            <Loader2 size={20} className="animate-spin" />
            <span>正在根据学习笔记出题…</span>
          </div>
        )}

        {phase === 'error' && (
          <div className="space-y-3 text-xs">
            <p className="text-[var(--danger)]">{errorMsg ?? '出题失败'}</p>
            <button
              type="button"
              className="px-3 py-1.5 rounded border border-[var(--border)]/50"
              onClick={() => void loadQuiz()}
            >
              重试
            </button>
          </div>
        )}

        {(phase === 'question' || phase === 'wrong') && currentQuestion && (
          <div className="mastery-quiz-card space-y-3">
            <p className="text-[10px] text-[var(--ink-muted)]">
              第 {currentNum} / {total} 题
            </p>
            <p className="text-sm font-medium leading-relaxed">{currentQuestion.prompt}</p>

            {phase === 'wrong' && explanation && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs">
                <p className="font-medium text-amber-200 mb-1">{explanationTitle}</p>
                <p className="opacity-90">{explanation}</p>
              </div>
            )}

            <textarea
              className="w-full min-h-[88px] text-xs rounded-lg border border-[var(--border)]/50 bg-white/5 px-2 py-1.5 outline-none resize-y"
              placeholder="在此作答…"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              disabled={busy}
            />

            {errorMsg && <p className="text-[10px] text-[var(--danger)]">{errorMsg}</p>}

            <button
              type="button"
              className="w-full py-2 text-xs rounded-lg bg-[var(--accent)]/25 ring-1 ring-[var(--accent)]/40 disabled:opacity-50"
              disabled={busy || !answer.trim()}
              onClick={() => void handleSubmit()}
            >
              {busy ? '判分中…' : phase === 'wrong' ? '再试一次' : '提交答案'}
            </button>
          </div>
        )}

        {phase === 'passed' && (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <CheckCircle2 size={32} className="text-emerald-400" />
            <p className="text-sm font-medium">已掌握</p>
            <p className="text-xs opacity-70 max-w-[200px]">
              「{targetLabel}」全部题目答对，知识树已更新为已掌握。
            </p>
            <button
              type="button"
              className="mt-2 px-4 py-1.5 text-xs rounded-lg border border-[var(--border)]/50"
              onClick={onClose}
            >
              完成
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
