type Box = { left: number; top: number; width: number; height: number }

// A widget's dialog opens over the widget: centred on it, at most 20 % larger, inside the viewport.
// The centre is clamped against the largest box, so a shorter dialog near an edge sits slightly off centre.
export function anchoredBox(widget: Box, viewport: { width: number; height: number }, gutter: number) {
  const maxWidth = Math.min(widget.width * 1.2, viewport.width - 2 * gutter)
  const maxHeight = Math.min(widget.height * 1.2, viewport.height - 2 * gutter)
  const clamp = (centre: number, size: number, space: number) => Math.min(Math.max(centre, gutter + size / 2), space - gutter - size / 2)
  return {
    x: clamp(widget.left + widget.width / 2, maxWidth, viewport.width),
    y: clamp(widget.top + widget.height / 2, maxHeight, viewport.height),
    maxWidth,
    maxHeight,
  }
}
