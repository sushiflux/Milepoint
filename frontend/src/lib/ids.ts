// Project/Board/WorkItem ids are 40-char git-style hashes on the backend. Use this wherever
// a short, human-referenceable form should be shown instead of the full id (e.g. "a1b2c3d").
export function shortId(id: string, length = 7): string {
  return id.slice(0, length)
}
