import { readMp4Metadata } from "./mp4.ts";

function box(type: string, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + payload.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, out.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(payload, 8);
  return out;
}
function join(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}
function sampleMp4(width = 1280, height = 720, frames = 300, duration = 10.5): Uint8Array {
  const mvhd = new Uint8Array(20);
  new DataView(mvhd.buffer).setUint32(12, 1000);
  new DataView(mvhd.buffer).setUint32(16, Math.round(duration * 1000));
  const tkhd = new Uint8Array(12);
  const tkhdView = new DataView(tkhd.buffer);
  tkhdView.setUint32(4, width * 65536);
  tkhdView.setUint32(8, height * 65536);
  const hdlr = new Uint8Array(12);
  hdlr.set(new TextEncoder().encode("vide"), 8);
  const stts = new Uint8Array(16);
  const sttsView = new DataView(stts.buffer);
  sttsView.setUint32(4, 1);
  sttsView.setUint32(8, frames);
  sttsView.setUint32(12, 35);
  const mediaInfo = box("minf", box("stbl", box("stts", stts)));
  const media = box("mdia", join(box("hdlr", hdlr), mediaInfo));
  const track = box("trak", join(box("tkhd", tkhd), media));
  return box("moov", join(box("mvhd", mvhd), track));
}
function expectThrow(run: () => unknown, includes: string) {
  try { run(); } catch (error) {
    if (error instanceof Error && error.message.includes(includes)) return;
    throw error;
  }
  throw new Error("Expected an error containing: " + includes);
}

Deno.test("reads MP4 duration, video dimensions and frame count", () => {
  const result = readMp4Metadata(sampleMp4());
  if (result.durationSeconds !== 10.5) throw new Error("Unexpected duration: " + result.durationSeconds);
  if (result.width !== 1280 || result.height !== 720) throw new Error("Unexpected dimensions.");
  if (result.frameCount !== 300) throw new Error("Unexpected frame count.");
});
Deno.test("rejects video above 720p before billing", () => {
  expectThrow(() => readMp4Metadata(sampleMp4(1920, 1080)), "720p");
});
Deno.test("rejects videos above 600 frames before billing", () => {
  expectThrow(() => readMp4Metadata(sampleMp4(1280, 720, 601)), "600 video frames");
});
Deno.test("rejects malformed MP4 files", () => {
  expectThrow(() => readMp4Metadata(new Uint8Array([1, 2, 3, 4])), "movie metadata");
});
