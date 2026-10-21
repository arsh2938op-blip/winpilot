// Tab navigation — swaps which <section class="page"> is visible.
const tabButtons = document.querySelectorAll('.tab-bar button')
const pages = document.querySelectorAll('.page')

tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.page

    tabButtons.forEach((b) => b.classList.toggle('active', b === btn))
    pages.forEach((p) => p.classList.toggle('active', p.dataset.page === target))
  })
})

// PWA install prompt ("Install app" button in the top bar).
// This is real, functional install plumbing — not a WinPilot feature —
// it's what makes "installed as an app" actually happen on Android/desktop
// Chrome. iOS Safari has no beforeinstallprompt event; it only supports
// manual "Add to Home Screen" from the share sheet, so the button simply
// won't appear there — that's expected, not a bug.
let deferredPrompt = null
const installBtn = document.getElementById('install-btn')

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault()
  deferredPrompt = event
  installBtn.style.display = 'inline-block'
})

installBtn.addEventListener('click', async () => {
  if (!deferredPrompt) return
  deferredPrompt.prompt()
  await deferredPrompt.userChoice
  deferredPrompt = null
  installBtn.style.display = 'none'
})

window.addEventListener('appinstalled', () => {
  installBtn.style.display = 'none'
})

// Register the service worker so the app is installable and can (later)
// work offline. Fails silently on browsers/contexts that don't support it.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {
      /* non-fatal: install prompt may just not be available in this context */
    })
  })
}
