export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (import.meta.env.DEV) return;

  try {
    await navigator.serviceWorker.register("/sw.js");
  } catch (error) {
    console.warn("Service worker registration failed", error);
  }
}

export function canInstallPwa() {
  return "BeforeInstallPromptEvent" in window || window.matchMedia("(display-mode: browser)").matches;
}
