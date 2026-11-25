export function readMp4Metadata(bytes: Uint8Array): { durationSeconds: number; width: number; height: number; frameCount: number | null } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const children = (start: number, end: number) => {
    const out: Array<{ type: string; payload: number; end: number }> = [];
    let offset = start;
    while (offset + 8 <= end) {
      let size = view.getUint32(offset);
      const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
      let header = 8;
      if (size === 1) {
        if (offset + 16 > end) break;
        const large = Number(view.getBigUint64(offset + 8));
        if (!Number.isSafeInteger(large)) break;
        size = large; header = 16;
      } else if (size === 0) size = end - offset;
      if (size < header || offset + size > end) break;
      out.push({ type, payload: offset + header, end: offset + size });
      offset += size;
    }
    return out;
  };
  const nested = (box: { payload: number; end: number }, type: string): { type: string; payload: number; end: number } | null => {
    for (const child of children(box.payload, box.end)) {
      if (child.type === type) return child;
      if (["moov", "trak", "mdia", "minf", "stbl"].includes(child.type)) {
        const found = nested(child, type);
        if (found) return found;
      }
    }
    return null;
  };
  const root = children(0, bytes.length);
  const moov = root.find(box => box.type === "moov");
  if (!moov) throw new Error("The uploaded MP4 has no readable movie metadata.");
  const mvhd = nested(moov, "mvhd");
  if (!mvhd || mvhd.payload + 20 > mvhd.end) throw new Error("The uploaded MP4 has no readable duration metadata.");
  const version = bytes[mvhd.payload];
  const timescaleOffset = mvhd.payload + (version === 1 ? 20 : 12);
  const durationOffset = mvhd.payload + (version === 1 ? 24 : 16);
  if (timescaleOffset + 4 > mvhd.end) throw new Error("The uploaded MP4 duration metadata is invalid.");
  const timescale = view.getUint32(timescaleOffset);
  const duration = version === 1 ? Number(view.getBigUint64(durationOffset)) : view.getUint32(durationOffset);
  const durationSeconds = duration / timescale;
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > 600) {
    throw new Error("Video duration must be between 1 second and 10 minutes.");
  }

  let width = 0, height = 0, frameCount: number | null = null;
  for (const trak of children(moov.payload, moov.end).filter(box => box.type === "trak")) {
    const mdia = children(trak.payload, trak.end).find(box => box.type === "mdia");
    if (!mdia) continue;
    const hdlr = children(mdia.payload, mdia.end).find(box => box.type === "hdlr");
    if (!hdlr || hdlr.payload + 12 > hdlr.end) continue;
    const handler = String.fromCharCode(bytes[hdlr.payload + 8], bytes[hdlr.payload + 9], bytes[hdlr.payload + 10], bytes[hdlr.payload + 11]);
    if (handler !== "vide") continue;
    const tkhd = children(trak.payload, trak.end).find(box => box.type === "tkhd");
    if (tkhd && tkhd.end - tkhd.payload >= 8) {
      width = Math.round(view.getUint32(tkhd.end - 8) / 65536);
      height = Math.round(view.getUint32(tkhd.end - 4) / 65536);
    }
    const stbl = nested(mdia, "stbl");
    const stts = stbl ? children(stbl.payload, stbl.end).find(box => box.type === "stts") : null;
    if (stts && stts.payload + 8 <= stts.end) {
      const count = view.getUint32(stts.payload + 4);
      let total = 0, offset = stts.payload + 8;
      for (let i = 0; i < count && offset + 8 <= stts.end; i++, offset += 8) total += view.getUint32(offset);
      frameCount = total || null;
    }
    break;
  }
  if (!width || !height) throw new Error("Could not read the video dimensions. Export a standard MP4 and try again.");
  if (width * height > 921600 || Math.max(width, height) > 1280) {
    throw new Error("PiAPI accepts videos up to 720p. Please export your video at 720p or lower.");
  }
  if (frameCount !== null && frameCount > 600) {
    throw new Error("PiAPI accepts a maximum of 600 video frames. Please shorten or lower the frame rate of your MP4.");
  }
  return { durationSeconds, width, height, frameCount };
}