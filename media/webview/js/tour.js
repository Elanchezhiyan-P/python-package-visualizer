/**
 * Welcome Interactive Tour for Python Package Visualizer.
 * Displays highlighting tooltips guiding new users through package stats,
 * PyPI installation, dependency graphs, and license risk dashboards.
 */

window.TOUR_STEPS = [
  { target: '#stats-bar',           titleKey: 'tour.step1Title', textKey: 'tour.step1Text' },
  { target: '#btn-add-pkg',         titleKey: 'tour.step2Title', textKey: 'tour.step2Text' },
  { target: '[data-tab="graph"]',   titleKey: 'tour.step3Title', textKey: 'tour.step3Text' },
  { target: '[data-tab="licenses"]', titleKey: 'tour.step4Title', textKey: 'tour.step4Text' },
];
window.tourStep = 0;

/**
 * Initiates the welcome walkthrough tour if it hasn't been completed before.
 */
window.startTour = function () {
  if (localStorage.getItem('tourShown')) return;
  window.tourStep = 0;
  window.showTourStep();
};

/**
 * Computes boundaries and places highlighting tooltips relative to targeted elements.
 */
window.showTourStep = function () {
  const backdrop = document.getElementById('tour-backdrop');
  const tooltip  = document.getElementById('tour-tooltip');
  if (!backdrop || !tooltip) return;

  const t = window.t || (key => key);

  if (window.tourStep >= window.TOUR_STEPS.length) {
    window.endTour();
    return;
  }

  const step = window.TOUR_STEPS[window.tourStep];
  const target = document.querySelector(step.target);

  const tLabel = document.getElementById('tour-step-label');
  const tTitle = document.getElementById('tour-title');
  const tText = document.getElementById('tour-text');
  const tNext = document.getElementById('tour-next');
  const tSkip = document.getElementById('tour-skip');

  const stepLabel = t('tour.stepOf')
    .replace('{current}', String(window.tourStep + 1))
    .replace('{total}', String(window.TOUR_STEPS.length));

  if (tLabel) tLabel.textContent = stepLabel;
  if (tTitle) tTitle.textContent = t(step.titleKey);
  if (tText) tText.textContent = t(step.textKey);
  if (tNext) tNext.textContent = window.tourStep === window.TOUR_STEPS.length - 1 ? t('tour.finish') : t('tour.next');
  if (tSkip) tSkip.textContent = t('tour.skip');

  backdrop.classList.add('active');
  tooltip.classList.add('active');

  if (target) {
    const rect = target.getBoundingClientRect();
    const ttW = 260;
    const ttH = 160;
    let top  = rect.bottom + 10;
    let left = rect.left;
    if (left + ttW > window.innerWidth - 10)  left = window.innerWidth - ttW - 10;
    if (top  + ttH > window.innerHeight - 10) top  = rect.top - ttH - 10;
    tooltip.style.top  = `${Math.max(8, top)}px`;
    tooltip.style.left = `${Math.max(8, left)}px`;
    tooltip.style.transform = 'none';
  } else {
    tooltip.style.top  = '50%';
    tooltip.style.left = '50%';
    tooltip.style.transform = 'translate(-50%,-50%)';
  }
};

/**
 * Safely hides tour screens and persists state to avoid re-triggering.
 */
window.endTour = function () {
  document.getElementById('tour-backdrop')?.classList.remove('active');
  document.getElementById('tour-tooltip')?.classList.remove('active');
  localStorage.setItem('tourShown', '1');
};
