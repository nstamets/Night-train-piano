// Record a take with the microphone so players can hear themselves.
// Takes stay on this device (in memory) unless the player saves or shares the file.
let rec = null, chunks = [], stream = null;

export function recSupported() {
  return typeof MediaRecorder !== 'undefined' && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

export async function startRec() {
  stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true } });
  const type = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find(t => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t));
  rec = new MediaRecorder(stream, type ? { mimeType: type } : {});
  chunks = [];
  rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  rec.start();
}

export function stopRec() {
  return new Promise(resolve => {
    if (!rec) { resolve(null); return; }
    const r = rec;
    r.onstop = () => {
      const blob = new Blob(chunks, { type: r.mimeType || 'audio/mp4' });
      stream && stream.getTracks().forEach(t => t.stop());
      rec = null; stream = null;
      resolve(blob.size ? blob : null);
    };
    try { r.stop(); } catch { resolve(null); }
  });
}

export function recording() { return !!rec; }

export async function shareTake(blob, name) {
  const ext = (blob.type || '').includes('webm') ? 'webm' : 'm4a';
  const file = new File([blob], `${name}.${ext}`, { type: blob.type || 'audio/mp4' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return true; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  return true;
}
