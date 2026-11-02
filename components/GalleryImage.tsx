"use client";

// A gallery image with simple "please don't save this" deterrents:
// no right-click menu, no dragging, no iPhone long-press menu (see CSS).
export default function GalleryImage({ src }: { src: string }) {
  return (
    <img
      src={src}
      alt="Sticker"
      loading="lazy"
      draggable={false}
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
    />
  );
}
