import { Chip } from '@heroui/react'

import type { ProductAnalysis } from '@/product-types'

export function ProductDecisionBadge({ analysis }: { analysis?: ProductAnalysis }) {
  if (!analysis || analysis.status !== 'complete') return null
  const label =
    analysis.decision === 'present_match'
      ? 'Eligible match'
      : analysis.decision === 'propose_alternatives'
        ? 'Alternative'
        : analysis.decision === 'ask_user'
          ? 'Needs information'
          : analysis.decision === 'reject'
            ? 'Rejected'
            : analysis.decision === 'wait_and_monitor'
              ? 'Wait for a match'
              : null
  if (!label) return null
  return (
    <Chip
      color={
        analysis.decision === 'reject'
          ? 'danger'
          : analysis.decision === 'present_match'
            ? 'accent'
            : 'warning'
      }
      variant="soft"
      size="sm"
      className="product-decision"
    >
      {label}
    </Chip>
  )
}

export function ProductAnalysisStatus({ analysis }: { analysis?: ProductAnalysis }) {
  if (!analysis || analysis.status === 'failed') {
    return (
      <div className="product-analysis" data-state={analysis ? 'failed' : 'unverified'}>
        <span>Independent checks</span>
        <small>{analysis ? 'Unavailable for this listing' : 'Not validated'}</small>
      </div>
    )
  }
  return (
    <div className="product-analysis" data-state="complete" title={analysis.summary}>
      <span>Independent checks</span>
      <ul aria-label={`Independent listing checks by ${analysis.model}`}>
        {analysis.checks.map((check) => (
          <li
            key={check.id}
            data-verdict={check.verdict}
            title={`${check.verdict}: ${check.note}`}
            aria-label={`${check.label} check ${check.verdict}. ${check.note}`}
          >
            {check.label}
          </li>
        ))}
      </ul>
    </div>
  )
}
