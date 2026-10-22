export function getNameInitials(name) {
  if (!name || typeof name !== "string") {
    return "SP";
  }

  const pieces = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (pieces.length === 0) {
    return "SP";
  }

  return pieces
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}
