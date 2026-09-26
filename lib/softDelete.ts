/** Soft-delete helpers — rows with deletedAt set are archived, not gone. */

export const notDeleted = { deletedAt: null } as const;

export function includeDeletedWhere(includeDeleted: boolean) {
  return includeDeleted ? {} : { deletedAt: null };
}
