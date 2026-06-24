// Breathing room left between the pinned header's break line and the top of the
// selected card, so it sits just below the header rather than flush against it.
const HEADER_GAP_PX = 16;

// Scroll a selected station card into the results list so its top sits just
// below the pinned "N stations near … / Edit" header — never hidden behind it.
export function scrollCardUnderHeader(el: HTMLElement | null): void {
  if (!el) return;

  const scroller = el.closest('.fw-scroll') as HTMLElement | null;
  if (!scroller) {
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return;
  }

  const header = scroller.querySelector('[data-results-header]') as HTMLElement | null;
  const headerHeight = header ? header.getBoundingClientRect().height : 0;

  const delta =
    el.getBoundingClientRect().top -
    scroller.getBoundingClientRect().top -
    headerHeight -
    HEADER_GAP_PX;
  scroller.scrollBy({ top: delta, behavior: 'smooth' });
}
