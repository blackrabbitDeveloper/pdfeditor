export function normalizeRotation(value) {
  return ((value % 360) + 360) % 360;
}

export function rotatePages(pages, selectedIds, amount) {
  const selected = new Set(selectedIds);
  return pages.map(page => selected.has(page.id)
    ? { ...page, rotation: normalizeRotation(page.rotation + amount) }
    : page);
}

export function duplicatePages(pages, selectedIds, createId) {
  const selected = new Set(selectedIds);
  return pages.flatMap(page => selected.has(page.id)
    ? [page, { ...page, id: createId() }]
    : [page]);
}

export function deletePages(pages, selectedIds) {
  const selected = new Set(selectedIds);
  return pages.filter(page => !selected.has(page.id));
}

export function movePages(pages, movingIds, targetId) {
  const moving = new Set(movingIds);
  if (moving.has(targetId)) return pages;
  const picked = pages.filter(page => moving.has(page.id));
  const rest = pages.filter(page => !moving.has(page.id));
  const targetIndex = rest.findIndex(page => page.id === targetId);
  if (targetIndex < 0) return [...rest, ...picked];
  return [...rest.slice(0, targetIndex), ...picked, ...rest.slice(targetIndex)];
}

