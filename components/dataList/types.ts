import type { ColumnDef, RowData } from "@tanstack/react-table";

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Hide this column below the given Chakra breakpoint. */
    hideBelow?: "md" | "lg";
    /** Right-align numeric cells. */
    numeric?: boolean;
    /** Narrow trailing action column. */
    isAction?: boolean;
    /** Right rail that stretches with the row (top/bottom controls). */
    isTrailing?: boolean;
  }
}

export type DataListColumnMeta = {
  hideBelow?: "md" | "lg";
  numeric?: boolean;
  isAction?: boolean;
  isTrailing?: boolean;
};

export type DataListSortOption = {
  id: string;
  label: string;
};

export type DataListFilterOption = {
  id: string;
  label: string;
};

/** Re-export for callers defining columns. */
export type { ColumnDef };
