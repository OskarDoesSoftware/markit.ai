const slides = Array.from(document.querySelectorAll('.slide'))
const fullscreenButton = document.querySelector('#fullscreen')
const currentLabel = document.querySelector('#current-slide')
const totalLabel = document.querySelector('#total-slides')
const announcement = document.querySelector('#slide-announcement')
const deckShell = document.querySelector('.deck-shell')
const slideViewport = document.querySelector('#slides')
const previousButton = document.querySelector('#previous-slide')
const nextButton = document.querySelector('#next-slide')
const chapterLabel = document.querySelector('#chapter-name')
const progress = document.querySelector('#deck-progress')

let currentIndex = 0
let touchStartX = null
let touchStartY = null

function indexFromHash() {
  const value = window.location.hash.slice(1)
  const parsed = /^\d+$/.test(value) ? Number(value) : 1
  return Number.isFinite(parsed) ? Math.max(0, Math.min(slides.length - 1, parsed - 1)) : 0
}

function formatSlideNumber(value) {
  return String(value).padStart(2, '0')
}

function renderSlide(nextIndex, options = {}) {
  const boundedIndex = Math.max(0, Math.min(slides.length - 1, nextIndex))
  const focusWasInSlide = slideViewport.contains(document.activeElement)
  currentIndex = boundedIndex

  slides.forEach((slide, index) => {
    const isActive = index === currentIndex
    slide.classList.remove('is-active')
    slide.hidden = !isActive
    slide.inert = !isActive
    slide.setAttribute('aria-hidden', String(!isActive))

    if (isActive)
      requestAnimationFrame(() => {
        if (!slide.hidden) slide.classList.add('is-active')
      })
  })

  const activeSlide = slides[currentIndex]
  const title =
    activeSlide.querySelector('h1, h2')?.textContent.trim() || `Slide ${currentIndex + 1}`

  currentLabel.textContent = formatSlideNumber(currentIndex + 1)
  totalLabel.textContent = formatSlideNumber(slides.length)
  previousButton.disabled = currentIndex === 0
  nextButton.disabled = currentIndex === slides.length - 1
  chapterLabel.textContent = activeSlide.dataset.chapter
  progress.max = slides.length
  progress.value = currentIndex + 1
  slideViewport.scrollTop = 0
  document.title = `${title} | Markit.ai`

  if (focusWasInSlide && options.announce !== false) {
    const heading = activeSlide.querySelector('h1, h2')
    heading.tabIndex = -1
    heading.focus({ preventScroll: true })
  }

  const hash = `#${currentIndex + 1}`
  if (window.location.hash !== hash) history.replaceState(null, '', hash)
  if (options.announce !== false)
    announcement.textContent = `Slide ${currentIndex + 1} of ${slides.length}: ${title}`
}

function goNext() {
  if (currentIndex < slides.length - 1) renderSlide(currentIndex + 1)
}

function goPrevious() {
  if (currentIndex > 0) renderSlide(currentIndex - 1)
}

previousButton.addEventListener('click', goPrevious)
nextButton.addEventListener('click', goNext)

function isInteractive(target) {
  return (
    target instanceof Element &&
    Boolean(
      target.closest(
        'a, button, input, textarea, select, [contenteditable]:not([contenteditable="false"])',
      ),
    )
  )
}

window.addEventListener('keydown', (event) => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return

  if (
    event.target instanceof Element &&
    event.target.closest(
      'input, textarea, select, [contenteditable]:not([contenteditable="false"])',
    )
  )
    return
  if ([' ', 'Enter'].includes(event.key) && isInteractive(event.target)) return

  if (['ArrowRight', 'PageDown', ' '].includes(event.key)) {
    event.preventDefault()
    goNext()
  } else if (['ArrowLeft', 'PageUp'].includes(event.key)) {
    event.preventDefault()
    goPrevious()
  } else if (event.key === 'Home') {
    event.preventDefault()
    renderSlide(0)
  } else if (event.key === 'End') {
    event.preventDefault()
    renderSlide(slides.length - 1)
  }
})

window.addEventListener('hashchange', () => {
  if (window.location.hash !== '#slides') renderSlide(indexFromHash())
})

slideViewport.addEventListener(
  'touchstart',
  (event) => {
    touchStartX = null
    touchStartY = null
    if (event.touches.length !== 1 || isInteractive(event.target)) return
    const touch = event.changedTouches[0]
    touchStartX = touch?.clientX ?? null
    touchStartY = touch?.clientY ?? null
  },
  { passive: true },
)

slideViewport.addEventListener(
  'touchend',
  (event) => {
    if (touchStartX === null || touchStartY === null) return
    const touch = event.changedTouches[0]
    const deltaX = (touch?.clientX ?? touchStartX) - touchStartX
    const deltaY = (touch?.clientY ?? touchStartY) - touchStartY
    touchStartX = null
    touchStartY = null

    if (Math.abs(deltaX) < 48 || Math.abs(deltaX) < Math.abs(deltaY) * 1.25) return
    if (deltaX < 0) goNext()
    else goPrevious()
  },
  { passive: true },
)

slideViewport.addEventListener('touchcancel', () => {
  touchStartX = null
  touchStartY = null
})

function updateFullscreenLabel() {
  const isFullscreen = Boolean(document.fullscreenElement)
  fullscreenButton.setAttribute('aria-label', isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen')
}

if (!document.fullscreenEnabled) {
  fullscreenButton.hidden = true
} else {
  fullscreenButton.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await deckShell.requestFullscreen()
    } catch {
      fullscreenButton.hidden = true
    }
  })
  document.addEventListener('fullscreenchange', updateFullscreenLabel)
}

renderSlide(indexFromHash(), { announce: false })
