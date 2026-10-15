import { ArrowUpRightFromSquare, Magnifier } from '@gravity-ui/icons'
import {
  Button,
  Chip,
  Input,
  Label,
  Link,
  ListBox,
  Select,
  Spinner,
  Table,
  TextField,
  type SortDescriptor,
} from '@heroui/react'
import { useEffect, useMemo, useState } from 'react'

import { downloadCsv } from '@/csv'
import type { SavedListing } from '@/saved-listing-types'

import './SavedListings.css'

type ListingStatus = 'loading' | 'ready' | 'error'
type PriceFilter = 'all' | 'priced' | 'unpriced'

function compareText(left: string, right: string): number {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' })
}

function formatSavedDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value))
}

export function SavedListings() {
  const [listings, setListings] = useState<SavedListing[]>([])
  const [status, setStatus] = useState<ListingStatus>('loading')
  const [query, setQuery] = useState('')
  const [source, setSource] = useState('all')
  const [priceFilter, setPriceFilter] = useState<PriceFilter>('all')
  const [sort, setSort] = useState<SortDescriptor>({ column: 'savedAt', direction: 'descending' })

  useEffect(() => {
    let active = true
    void fetch('/api/listings', { credentials: 'same-origin' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Saved listings unavailable')
        return (await response.json()) as { listings: SavedListing[] }
      })
      .then(({ listings: savedListings }) => {
        if (!active) return
        setListings(savedListings)
        setStatus('ready')
      })
      .catch(() => {
        if (active) setStatus('error')
      })
    return () => {
      active = false
    }
  }, [])

  const sources = useMemo(
    () => [...new Set(listings.map((listing) => listing.source))].sort(compareText),
    [listings],
  )

  const visibleListings = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    const filtered = listings.filter((listing) => {
      const matchesQuery =
        !normalizedQuery ||
        listing.title.toLocaleLowerCase().includes(normalizedQuery) ||
        listing.source.toLocaleLowerCase().includes(normalizedQuery)
      const matchesSource = source === 'all' || listing.source === source
      const matchesPrice =
        priceFilter === 'all' ||
        (priceFilter === 'priced' ? Boolean(listing.price) : !listing.price)
      return matchesQuery && matchesSource && matchesPrice
    })

    const direction = sort.direction === 'ascending' ? 1 : -1
    return filtered.toSorted((left, right) => {
      let comparison = 0
      if (sort.column === 'title') comparison = compareText(left.title, right.title)
      if (sort.column === 'source') comparison = compareText(left.source, right.source)
      if (sort.column === 'price') comparison = compareText(left.price ?? '', right.price ?? '')
      if (sort.column === 'savedAt') {
        comparison = new Date(left.savedAt).getTime() - new Date(right.savedAt).getTime()
      }
      return comparison * direction
    })
  }, [listings, priceFilter, query, sort, source])

  const filtersAreActive = Boolean(query) || source !== 'all' || priceFilter !== 'all'

  const exportListings = () => {
    downloadCsv(
      'markit-saved-listings.csv',
      ['Product', 'Price', 'Retailer', 'Saved at', 'URL'],
      visibleListings.map((listing) => [
        listing.title,
        listing.price,
        listing.source,
        listing.savedAt,
        listing.url,
      ]),
    )
  }

  const resetFilters = () => {
    setQuery('')
    setSource('all')
    setPriceFilter('all')
  }

  return (
    <section className="saved-listings saved-table-section">
      <header className="saved-listings-header saved-table-header">
        <div>
          <h2>Saved listings</h2>
          <p>Filter, sort, and revisit products saved from your shopping research.</p>
        </div>
        <div className="saved-listings-actions">
          {status === 'ready' && listings.length ? (
            <Chip size="sm" variant="soft" color="success">
              {visibleListings.length} of {listings.length}
            </Chip>
          ) : null}
          <Button
            size="sm"
            variant="secondary"
            isDisabled={status !== 'ready' || visibleListings.length === 0}
            onPress={exportListings}
          >
            Export CSV
          </Button>
        </div>
      </header>

      {status === 'loading' ? (
        <div className="listings-state" role="status">
          <Spinner size="sm" /> Loading listings…
        </div>
      ) : status === 'error' ? (
        <div className="listings-state" role="alert">
          Saved listings could not be loaded. Refresh to try again.
        </div>
      ) : listings.length === 0 ? (
        <div className="listings-state">
          Save products from a results table or ask Markit to “save this listing.”
        </div>
      ) : (
        <div className="saved-table-surface">
          <div className="saved-table-filters" aria-label="Saved listing filters">
            <TextField
              type="search"
              value={query}
              onChange={setQuery}
              className="saved-table-search"
            >
              <Label>Search saved listings</Label>
              <div className="saved-table-search-input">
                <Magnifier aria-hidden="true" />
                <Input placeholder="Search products or retailers" />
              </div>
            </TextField>

            <Select
              selectedKey={source}
              onSelectionChange={(key) => setSource(key ? String(key) : 'all')}
              className="saved-table-filter"
            >
              <Label>Retailer</Label>
              <Select.Trigger>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  <ListBox.Item id="all">All retailers</ListBox.Item>
                  {sources.map((retailer) => (
                    <ListBox.Item id={retailer} key={retailer}>
                      {retailer}
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>

            <Select
              selectedKey={priceFilter}
              onSelectionChange={(key) => setPriceFilter((key || 'all') as PriceFilter)}
              className="saved-table-filter"
            >
              <Label>Price data</Label>
              <Select.Trigger>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  <ListBox.Item id="all">All price data</ListBox.Item>
                  <ListBox.Item id="priced">Price available</ListBox.Item>
                  <ListBox.Item id="unpriced">Price unavailable</ListBox.Item>
                </ListBox>
              </Select.Popover>
            </Select>

            {filtersAreActive ? (
              <Button
                size="sm"
                variant="ghost"
                className="saved-filter-reset"
                onPress={resetFilters}
              >
                Clear filters
              </Button>
            ) : null}
          </div>

          <Table variant="secondary" className="saved-listings-table">
            <Table.ScrollContainer>
              <Table.Content
                aria-label="Saved product listings"
                sortDescriptor={sort}
                onSortChange={setSort}
              >
                <Table.Header>
                  <Table.Column id="title" isRowHeader allowsSorting>
                    Product
                  </Table.Column>
                  <Table.Column id="source" allowsSorting>
                    Retailer
                  </Table.Column>
                  <Table.Column id="price" allowsSorting>
                    Price
                  </Table.Column>
                  <Table.Column id="savedAt" allowsSorting>
                    Saved
                  </Table.Column>
                  <Table.Column id="action">Action</Table.Column>
                </Table.Header>
                <Table.Body
                  items={visibleListings}
                  renderEmptyState={() => (
                    <div className="saved-table-empty">
                      <strong>No matching listings</strong>
                      <span>Try clearing or changing your filters.</span>
                    </div>
                  )}
                >
                  {(listing) => (
                    <Table.Row id={listing.id}>
                      <Table.Cell>
                        <div className="saved-product-cell">
                          <div className="saved-product-image" aria-hidden="true">
                            {listing.image ? (
                              <img src={listing.image} alt="" loading="lazy" />
                            ) : (
                              '♡'
                            )}
                          </div>
                          <strong title={listing.title}>{listing.title}</strong>
                        </div>
                      </Table.Cell>
                      <Table.Cell>
                        <span className="saved-retailer">{listing.source}</span>
                      </Table.Cell>
                      <Table.Cell>
                        {listing.price ? (
                          <Chip size="sm" variant="soft">
                            {listing.price}
                          </Chip>
                        ) : (
                          <span className="saved-price-missing">Unavailable</span>
                        )}
                      </Table.Cell>
                      <Table.Cell>
                        <time dateTime={listing.savedAt}>{formatSavedDate(listing.savedAt)}</time>
                      </Table.Cell>
                      <Table.Cell>
                        <Link
                          href={listing.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`View ${listing.title}`}
                          className="saved-product-link"
                        >
                          View
                          <ArrowUpRightFromSquare aria-hidden="true" />
                        </Link>
                      </Table.Cell>
                    </Table.Row>
                  )}
                </Table.Body>
              </Table.Content>
            </Table.ScrollContainer>
          </Table>
        </div>
      )}
    </section>
  )
}
