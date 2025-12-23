// Triggers a browser download without navigating away or opening a new tab.
// Works great with cross-origin presigned URLs if the response has
// Content-Disposition: attachment.
export function triggerDownloadFromUrl(url: string) {
  // create an invisible iframe that points to the file
  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  iframe.src = url;

  // append, then remove it after a bit
  document.body.appendChild(iframe);
  // give the browser time to start the download
  setTimeout(() => {
    try {
      document.body.removeChild(iframe);
    } catch {}
  }, 30_000);
}
