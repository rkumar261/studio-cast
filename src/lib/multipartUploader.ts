// src/lib/multipartUploader.ts
export type CompletePart = { partNumber: number; etag: string };

export async function uploadMultipartFile(
  file: File,
  presignedUrls: string[],
  partSize: number,
  onProgress?: (pct: number) => void,
  concurrency = 4,
  maxRetries = 3
): Promise<CompletePart[]> {
  let uploadedBytes = 0, lastPct = -1;

  const parts = presignedUrls.map((url, i) => {
    const start = i * partSize;
    const end = Math.min((i + 1) * partSize, file.size);
    return { url, partNumber: i + 1, start, end };
  });

  const run = async (p: typeof parts[number]) => {
    const blob = file.slice(p.start, p.end);
    
    let attempt = 0;
    while (true) {
      try {
        const res = await fetch(p.url, { method: 'PUT', body: blob });
        if (!res.ok) throw new Error(`PUT part ${p.partNumber} ${res.status}`);
        
        const etag = res.headers.get('ETag') || res.headers.get('etag');
        if (!etag) throw new Error('Missing ETag');
        uploadedBytes += blob.size;
        const pct = Math.floor((uploadedBytes / file.size) * 100);
        
        if (pct !== lastPct) { lastPct = pct; onProgress?.(pct); }
        return { partNumber: p.partNumber, etag };
      } catch (e) {
        if (++attempt > maxRetries) throw e;
        await new Promise(r => setTimeout(r, 300 * attempt));
      }
    }
  };

  const results: CompletePart[] = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(concurrency, parts.length) }, async () => {
    while (i < parts.length) results.push(await run(parts[i++]));
  });

  await Promise.all(workers);
  return results.sort((a, b) => a.partNumber - b.partNumber);
}
