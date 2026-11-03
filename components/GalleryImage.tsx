"use client";

// A gallery image with simple "please don't save this" deterrents:
// no right-click menu, no dragging, no iPhone long-press menu (see CSS).
export default function GalleryImage({ src, alt }: { src: string; alt: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- our API route already serves the sized PNG
    <img
      src={src}
      alt={alt}
      loading="lazy"
      draggable={false}
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
    />
  );
}
