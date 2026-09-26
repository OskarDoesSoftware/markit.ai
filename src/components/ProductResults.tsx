import { ArrowUpRightFromSquare } from '@gravity-ui/icons'
import { Button, Drawer, Link } from '@heroui/react'
import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'

import { downloadCsv } from '@/csv'
import type {
  ProductAnalysis,
  ProductCardData,
  ProductSortMode,
  ProductViewMode,
} from '@/product-types'
import { useIsMobile } from '@/use-is-mobile'

import { ProductCards } from './ProductCards'

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

function ProductTable({
  products,
  savedUrls,
}: {
  products: ProductCardData[]
  savedUrls: ReadonlySet<string>
}) {
  return (
    <div className="product-table-wrap">
      <table className="product-table">
        <thead>
          <tr>
            <th scope="col">Product</th>
            <th scope="col">Price</th>
            <th scope="col">Delivery</th>
            <th scope="col">Reliability</th>
            <th scope="col">Retailer</th>
          </tr>
        </thead>
        <tbody>
          {products.map((product, index) => (
            <tr data-top-pick={index === 0 || undefined} key={product.url}>
              <th scope="row">
                <div className="product-table-name">
                  {product.image ? <img src={product.image} alt="" loading="lazy" /> : null}
                  <span>
                    <strong>{product.title}</strong>
                    {index === 0 ? (
                      <small className="product-top-pick-label">Top pick</small>
                    ) : null}
                    {savedUrls.has(product.url) ? <small>✓ Saved</small> : null}
                  </span>
                </div>
              </th>
              <td>{product.price || 'Not verified'}</td>
              <td>{product.shipping || 'Not verified'}</td>
              <td>
                <strong>{product.sellerReliability.score}/100</strong>
                <small>{product.sellerReliability.label}</small>
              </td>
              <td>
                <Link href={product.url} target="_blank" rel="noopener noreferrer">
                  {product.source}
                  <ArrowUpRightFromSquare aria-hidden="true" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ProductPresentation({
  products,
  analyses,
  savedUrls,
  view,
  sort,
  onSaveListings,
  saveState,
}: {
  products: ProductCardData[]
  analyses: Record<string, ProductAnalysis>
  savedUrls: ReadonlySet<string>
  view: ProductViewMode
  sort: ProductSortMode
  onSaveListings: () => void
  saveState: 'idle' | 'saving' | 'saved' | 'error'
}) {
  return (
    <div className="product-arrangement" key={`${view}-${sort}`}>
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
          <ProductTable products={products} savedUrls={savedUrls} />
        </>
      ) : (
        <ProductCards products={products} analyses={analyses} savedUrls={savedUrls} view={view} />
      )}
    </div>
  )
}

export function ProductResults({
  isOpen,
  heading,
  products,
  analyses,
  savedUrls,
  view,
  sort,
}: {
  isOpen: boolean
  heading: string
  products: ProductCardData[]
  analyses: Record<string, ProductAnalysis>
  savedUrls: ReadonlySet<string>
  view: ProductViewMode
  sort: ProductSortMode
}) {
  const isMobile = useIsMobile()
  const reduced = useReducedMotion()
  const hasProducts = isOpen && products.length > 0
  const [locallySavedUrls, setLocallySavedUrls] = useState<ReadonlySet<string>>(new Set())
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const allSavedUrls = new Set([...savedUrls, ...locallySavedUrls])

  useEffect(() => setSaveState('idle'), [products])

  const saveToListings = async () => {
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

  return (
    <>
      <motion.aside
        className="desktop-product-panel"
        layoutScroll
        data-open={hasProducts}
        aria-hidden={!hasProducts}
        inert={!hasProducts}
        initial={false}
        animate={{ opacity: hasProducts ? 1 : 0 }}
        transition={{ duration: reduced ? 0 : 0.3 }}
      >
        <div className="product-panel-heading">
          <div>
            <span>Live commerce data</span>
            <h2>{heading}</h2>
          </div>
          <small>
            {view} · {SORT_LABELS[sort]} · {products.length} results
          </small>
        </div>
        <ProductPresentation
          products={products}
          analyses={analyses}
          savedUrls={allSavedUrls}
          view={view}
          sort={sort}
          onSaveListings={() => void saveToListings()}
          saveState={saveState}
        />
      </motion.aside>

      {isMobile ? (
        <Drawer.Backdrop isOpen={hasProducts} isDismissable={false}>
          <Drawer.Content placement="bottom">
            <Drawer.Dialog className="product-drawer">
              <Drawer.Handle />
              <Drawer.Header className="product-drawer-header">
                <span>Live commerce data</span>
                <Drawer.Heading>{heading}</Drawer.Heading>
              </Drawer.Header>
              <Drawer.Body className="product-drawer-body">
                <ProductPresentation
                  products={products}
                  analyses={analyses}
                  savedUrls={allSavedUrls}
                  view={view}
                  sort={sort}
                  onSaveListings={() => void saveToListings()}
                  saveState={saveState}
                />
              </Drawer.Body>
            </Drawer.Dialog>
          </Drawer.Content>
        </Drawer.Backdrop>
      ) : null}
    </>
  )
}
