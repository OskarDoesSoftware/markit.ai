import { ArrowUpRightFromSquare } from '@gravity-ui/icons'
import { Card, Chip, Disclosure, Link, Meter } from '@heroui/react'
import { motion, useReducedMotion } from 'motion/react'

import type { ProductAnalysis, ProductCardData, ProductViewMode } from '@/product-types'

import { ProductValidationSources } from './ProductValidationSources'

const RELIABILITY_COLOR = {
  strong: 'accent',
  moderate: 'default',
  limited: 'warning',
} as const

function formatListedDate(published: string | undefined): string | null {
  if (!published) return null
  const date = new Date(published)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(date)
}

function ProductDetails({
  product,
  analysis,
}: {
  product: ProductCardData
  analysis: ProductAnalysis | undefined
}) {
  const listedDate = formatListedDate(product.publishedDate)
  const hasChecks = analysis?.status === 'complete' && analysis.checks.length > 0

  return (
    <Disclosure className="product-details">
      <Disclosure.Heading className="product-details-heading">
        <Disclosure.Trigger className="product-details-trigger">
          View details
          <Disclosure.Indicator />
        </Disclosure.Trigger>
      </Disclosure.Heading>
      <Disclosure.Content>
        <Disclosure.Body className="product-details-body">
          {product.highlights.length > 0 ? (
            <section>
              <span className="product-details-kicker">Highlights</span>
              <ul className="product-highlight-list">
                {product.highlights.map((highlight) => (
                  <li key={highlight}>{highlight}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {hasChecks ? (
            <section>
              <span className="product-details-kicker">Independent checks · {analysis.model}</span>
              {analysis.summary ? (
                <p className="product-details-summary">{analysis.summary}</p>
              ) : null}
              <ul className="product-check-list">
                {analysis.checks.map((check) => (
                  <li key={check.id} data-verdict={check.verdict}>
                    <strong>{check.label}</strong>
                    <span>{check.note}</span>
                  </li>
                ))}
              </ul>
              <ProductValidationSources analysis={analysis} />
            </section>
          ) : null}

          {product.sellerReliability.basis.length > 0 ? (
            <section>
              <span className="product-details-kicker">Reliability evidence</span>
              <ul className="product-evidence-list">
                {product.sellerReliability.basis.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {listedDate ? <p className="product-details-meta">Listed {listedDate}</p> : null}
        </Disclosure.Body>
      </Disclosure.Content>
    </Disclosure>
  )
}

function AnalysisChecks({ analysis }: { analysis: ProductAnalysis | undefined }) {
  if (!analysis) {
    return (
      <div className="product-analysis" data-state="pending" role="status">
        <span>Independent checks</span>
        <small>Auditing listing…</small>
      </div>
    )
  }

  if (analysis.status === 'failed') {
    return (
      <div className="product-analysis" data-state="failed">
        <span>Independent checks</span>
        <small>Unavailable for this listing</small>
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

export function ProductCards({
  products,
  analyses,
  savedUrls,
  view,
}: {
  products: ProductCardData[]
  analyses: Record<string, ProductAnalysis>
  savedUrls: ReadonlySet<string>
  view: Exclude<ProductViewMode, 'table'>
}) {
  const reduced = useReducedMotion()
  return (
    <div className="product-card-list" data-view={view}>
      {products.map((product, index) => (
        <motion.div
          key={product.url}
          className="product-card-motion"
          layout="position"
          initial={{ opacity: 0, y: reduced ? 0 : 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: reduced ? 0 : 0.3,
            delay: reduced ? 0 : Math.min(index * 0.055, 0.22),
            layout: { type: 'spring', stiffness: 150, damping: 26 },
          }}
        >
          <Card className="product-card" data-top-pick={index === 0 || undefined}>
            <div className="product-image product-image-fallback" aria-hidden="true">
              {product.favicon ? (
                <img src={product.favicon} alt="" />
              ) : (
                <span>{product.source.slice(0, 1).toUpperCase()}</span>
              )}
              {product.image ? (
                <img
                  className="product-image-photo"
                  src={product.image}
                  alt=""
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  onError={(event) => {
                    event.currentTarget.hidden = true
                  }}
                />
              ) : null}
            </div>
            <div className="product-card-copy">
              <Card.Header className="product-card-header">
                <div className="product-source-row">
                  <span>{product.source}</span>
                  <div className="product-source-meta">
                    {index === 0 ? (
                      <Chip color="accent" variant="soft" size="sm" className="product-top-pick">
                        Top pick
                      </Chip>
                    ) : null}
                    {savedUrls.has(product.url) ? (
                      <Chip
                        color="success"
                        variant="soft"
                        size="sm"
                        className="product-saved-indicator"
                      >
                        <span aria-hidden="true">✓</span> Saved
                      </Chip>
                    ) : null}
                  </div>
                </div>
                <Card.Title className="product-title">{product.title}</Card.Title>
                {product.price || product.discount ? (
                  <div className="product-price-row">
                    {product.price ? (
                      <strong className="product-price">{product.price}</strong>
                    ) : null}
                    {product.discount ? (
                      <Chip
                        size="sm"
                        variant="soft"
                        color="accent"
                        className="product-discount-chip"
                        title={product.discount}
                      >
                        {product.discount}
                      </Chip>
                    ) : null}
                  </div>
                ) : null}
                {product.highlights[0] ? (
                  <Card.Description className="product-description">
                    {product.highlights[0]}
                  </Card.Description>
                ) : null}
              </Card.Header>
              <Card.Content className="product-offer-details">
                <div data-verified={Boolean(product.shipping)}>
                  <span>Delivery</span>
                  <p>{product.shipping || 'Cost not found in source'}</p>
                </div>
              </Card.Content>
              <AnalysisChecks analysis={analyses[product.url]} />
              <ProductDetails product={product} analysis={analyses[product.url]} />
              <Card.Footer className="product-footer">
                <div
                  className="seller-reliability"
                  title={product.sellerReliability.basis.join(' • ')}
                >
                  <Meter
                    value={product.sellerReliability.score}
                    color={RELIABILITY_COLOR[product.sellerReliability.label]}
                    aria-label="Seller reliability"
                  >
                    <div className="seller-reliability-row">
                      <span>Seller reliability</span>
                      <Meter.Output>{product.sellerReliability.score}/100</Meter.Output>
                    </div>
                    <Meter.Track>
                      <Meter.Fill />
                    </Meter.Track>
                    <small>{product.sellerReliability.label} evidence score</small>
                  </Meter>
                </div>
                <Link
                  href={product.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`View ${product.title} at ${product.source}`}
                >
                  View product
                  <ArrowUpRightFromSquare aria-hidden="true" />
                </Link>
              </Card.Footer>
            </div>
          </Card>
        </motion.div>
      ))}
    </div>
  )
}
