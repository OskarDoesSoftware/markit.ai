import { Button, Drawer } from '@heroui/react'
import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'

import { downloadCsv } from '@/csv'
import type { ProductPanelState } from '@/product-panel-state'
import type {
  ProductAnalysis,
  ProductCardData,
  ProductSortMode,
  ProductViewMode,
} from '@/product-types'
import { useIsMobile } from '@/use-is-mobile'

import { ProductCards } from './ProductCards'
import {
  ProductPanelStatus,
  ProductVoiceControls,
  type ProductVoiceControlsProps,
} from './ProductPanelStatus'
import { ProductTable } from './ProductTable'

const SORT_LABELS: Record<ProductSortMode, string> = {
  relevance: 'Relevance',
  price_asc: 'Price: low to high',
  price_desc: 'Price: high to low',
  reliability_desc: 'Seller reliability',
}

function saveProductsCsv(products: ProductCardData[]) {
  downloadCsv(
    'markit-listings.csv',
    ['Product', 'Price', 'Currency', 'Delivery', 'Reliability', 'Retailer', 'URL'],
    products.map((product) => [
      product.title,
      product.price,
      product.priceCurrency,
      product.shipping,
      product.sellerReliability.score,
      product.source,
      product.url,
    ]),
  )
}

function ProductPresentation({
  products,
  analyses,
  savedUrls,
  view,
  onSaveListings,
  saveState,
  expandedUrls,
  onExpandedChange,
}: {
  products: ProductCardData[]
  analyses: Record<string, ProductAnalysis>
  savedUrls: ReadonlySet<string>
  view: ProductViewMode
  onSaveListings: () => void
  saveState: 'idle' | 'saving' | 'saved' | 'error'
  expandedUrls: ReadonlySet<string>
  onExpandedChange: (url: string, value: boolean) => void
}) {
  return (
    <div className="product-arrangement">
      {view === 'table' ? (
        <>
          <div className="product-table-actions">
            <span role="status" aria-live="polite">
              {saveState === 'saved'
                ? 'Saved under Account → Saved listings'
                : saveState === 'error'
                  ? 'Could not save listings. Log in and try again.'
                  : ''}
            </span>
            <Button size="sm" variant="ghost" onPress={() => saveProductsCsv(products)}>
              Save CSV
            </Button>
            <Button size="sm" isDisabled={saveState === 'saving'} onPress={onSaveListings}>
              {saveState === 'saving' ? 'Saving…' : 'Save to listings'}
            </Button>
          </div>
          <ProductTable products={products} savedUrls={savedUrls} analyses={analyses} />
        </>
      ) : (
        <ProductCards
          products={products}
          analyses={analyses}
          savedUrls={savedUrls}
          view={view}
          expandedUrls={expandedUrls}
          onExpandedChange={onExpandedChange}
        />
      )}
    </div>
  )
}

export function ProductResults({
  panel,
  savedUrls,
  voice,
}: {
  panel: ProductPanelState
  savedUrls: ReadonlySet<string>
  voice: ProductVoiceControlsProps
}) {
  const { heading, products, analyses, view, sort, stage, notice, researchId } = panel
  const isMobile = useIsMobile()
  const reduced = useReducedMotion()
  const isOpen = panel.isOpen
  const [locallySavedUrls, setLocallySavedUrls] = useState<ReadonlySet<string>>(new Set())
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [expandedUrls, setExpandedUrls] = useState<ReadonlySet<string>>(new Set())
  const allSavedUrls = new Set([...savedUrls, ...locallySavedUrls])

  useEffect(() => {
    setSaveState('idle')
    setExpandedUrls(new Set())
  }, [researchId])
  const onExpandedChange = (url: string, expanded: boolean) =>
    setExpandedUrls((current) => {
      const next = new Set(current)
      if (expanded) next.add(url)
      else next.delete(url)
      return next
    })

  const saveToListings = async () => {
    if (stage !== 'ready' || !products.length) return
    setSaveState('saving')
    try {
      const response = await fetch('/api/listings', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ products }),
      })
      if (!response.ok) throw new Error('Unable to save listings')
      const body = (await response.json()) as { listings: Array<{ url: string }> }
      setLocallySavedUrls((current) => {
        const updated = new Set(current)
        for (const listing of body.listings) updated.add(listing.url)
        return updated
      })
      setSaveState('saved')
    } catch {
      setSaveState('error')
    }
  }

  const content = (
    <>
      {panel.restored && stage === 'ready' ? (
        <p className="product-panel-notice" role="status">
          Previous research · prices and availability may have changed. Ask Markit to check again
          before buying.
        </p>
      ) : null}
      {notice ? (
        <p className="product-panel-notice" role="status">
          {notice}
        </p>
      ) : null}
      {stage !== 'ready' || !products.length ? (
        <ProductPanelStatus stage={stage} />
      ) : (
        <ProductPresentation
          products={products}
          analyses={analyses}
          savedUrls={allSavedUrls}
          view={view}
          onSaveListings={() => void saveToListings()}
          saveState={saveState}
          expandedUrls={expandedUrls}
          onExpandedChange={onExpandedChange}
        />
      )}
    </>
  )

  return (
    <>
      <motion.aside
        className="desktop-product-panel"
        layoutScroll
        data-open={isOpen}
        aria-hidden={!isOpen}
        inert={!isOpen}
        initial={false}
        animate={{ opacity: isOpen ? 1 : 0 }}
        transition={{ duration: reduced ? 0 : 0.3 }}
      >
        <div className="product-panel-heading">
          <div>
            <span>Product research</span>
            <h2>{heading}</h2>
          </div>
          <small>
            {stage === 'ready' && products.length
              ? `${view} · ${SORT_LABELS[sort]} · ${products.length} results`
              : 'Research status'}
          </small>
        </div>
        {content}
      </motion.aside>
      {isMobile ? (
        <Drawer.Backdrop isOpen={isOpen} isDismissable={false}>
          <Drawer.Content placement="bottom">
            <Drawer.Dialog className="product-drawer">
              <Drawer.Handle />
              <Drawer.Header className="product-drawer-header">
                <span>Product research</span>
                <Drawer.Heading>{heading}</Drawer.Heading>
                <ProductVoiceControls {...voice} />
              </Drawer.Header>
              <Drawer.Body className="product-drawer-body">{content}</Drawer.Body>
            </Drawer.Dialog>
          </Drawer.Content>
        </Drawer.Backdrop>
      ) : null}
    </>
  )
}
