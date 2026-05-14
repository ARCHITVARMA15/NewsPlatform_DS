// Service worker — minimal setup
chrome.runtime.onInstalled.addListener(() => {
  console.log('Datastraw Analyzer installed');
  chrome.storage.local.set({ apiUrl: 'http://localhost:8000' });
});
