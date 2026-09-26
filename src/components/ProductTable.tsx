import { ArrowUpRightFromSquare } from '@gravity-ui/icons'
import { Link } from '@heroui/react'

import type { ProductAnalysis, ProductCardData } from '@/product-types'

import { ProductAnalysisStatus, ProductDecisionBadge } from './ProductAnalysisStatus'
import { ProductValidationSources } from './ProductValidationSources'

export function ProductTable({
  products,
  savedUrls,
  analyses,
}: {
  products: ProductCardData[]
  savedUrls: ReadonlySet<string>
  analyses: Record<string, ProductAnalysis>
}) {
  return (
    <div
      className="product-table-wrap"
      tabIndex={0}
      role="region"
      aria-label="Scrollable product comparison"
    >
      <table className="product-table">
        <thead>
          <tr>
            <th scope="col">Product</th>
            <th scope="col">Price</th>
            <th scope="col">Delivery</th>
            <th scope="col">Checks</th>
            <th scope="col">Reliability</th>
            <th scope="col">Retailer</th>
          </tr>
        </thead>
        <tbody>
          {products.map((product) => (
            <tr key={product.url}>
              <th scope="row">
                <div className="product-table-name">
                  {product.image ? <img src={product.image} alt="" loading="lazy" /> : null}
                  <span>
                    <strong>{product.title}</strong>
                    <ProductDecisionBadge analysis={analyses[product.url]} />
                    {savedUrls.has(product.url) ? <small>✓ Saved</small> : null}
                  </span>
                </div>
              </th>
              <td>{product.price || 'Not verified'}</td>
              <td>{product.shipping || 'Not verified'}</td>
              <td>
                <ProductAnalysisStatus analysis={analyses[product.url]} />
                {analyses[product.url] ? (
                  <ProductValidationSources analysis={analyses[product.url]!} />
                ) : null}
              </td>
              <td>
                <strong>{product.sellerReliability.score}/100</strong>
                <small>{product.sellerReliability.label} evidence score</small>
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
