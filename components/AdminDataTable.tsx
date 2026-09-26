import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Box,
  Button,
  Checkbox,
  HStack,
  IconButton,
  Input,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  VStack,
} from "@chakra-ui/react";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  TriangleDownIcon,
  TriangleUpIcon,
} from "@chakra-ui/icons";

export type AdminColumn<T> = {
  id: string;
  header: string;
  /** Value used for sorting (and filtering unless getFilterValue is set). */
  getSortValue?: (row: T) => string | number | boolean | null | undefined;
  /** Extra / override text included in the global filter. */
  getFilterValue?: (row: T) => string | number | boolean | null | undefined;
  cell: (row: T) => ReactNode;
  /** Defaults to true. */
  defaultVisible?: boolean;
  disableSort?: boolean;
  minW?: string | number;
  maxW?: string | number;
  whiteSpace?: "nowrap" | "normal";
};

type SortState = { id: string; dir: "asc" | "desc" } | null;

function storageKey(tableId: string) {
  return `adminDataTable:${tableId}:v1`;
}

function loadPrefs(tableId: string): {
  visible?: Record<string, boolean>;
  sort?: SortState;
} {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(storageKey(tableId));
    if (!raw) return {};
    return JSON.parse(raw) as {
      visible?: Record<string, boolean>;
      sort?: SortState;
    };
  } catch {
    return {};
  }
}

function savePrefs(
  tableId: string,
  prefs: { visible: Record<string, boolean>; sort: SortState },
) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey(tableId), JSON.stringify(prefs));
  } catch {
    /* ignore quota */
  }
}

function toFilterString(
  value: string | number | boolean | null | undefined,
): string {
  if (value == null) return "";
  return String(value).toLowerCase();
}

function compareValues(
  a: string | number | boolean | null | undefined,
  b: string | number | boolean | null | undefined,
): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") {
    return Number(a) - Number(b);
  }
  return String(a).localeCompare(String(b), undefined, {
    sensitivity: "base",
    numeric: true,
  });
}

export default function AdminDataTable<T>({
  tableId,
  rows,
  columns,
  getRowId,
  emptyMessage = "No rows",
  toolbarLeft,
  onRowClick,
  isRowSelected,
  renderExpandedRow,
  isRowExpanded,
  onToggleExpand,
}: {
  tableId: string;
  rows: T[];
  columns: AdminColumn<T>[];
  getRowId: (row: T) => string;
  emptyMessage?: string;
  toolbarLeft?: ReactNode;
  onRowClick?: (row: T) => void;
  isRowSelected?: (row: T) => boolean;
  /** When set, shows an expand chevron column and a full-width detail row. */
  renderExpandedRow?: (row: T) => ReactNode;
  isRowExpanded?: (row: T) => boolean;
  onToggleExpand?: (row: T) => void;
}) {
  const defaultVisible = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const col of columns) {
      map[col.id] = col.defaultVisible !== false;
    }
    return map;
  }, [columns]);

  const [visible, setVisible] = useState<Record<string, boolean>>(defaultVisible);
  const [sort, setSort] = useState<SortState>(null);
  const [filter, setFilter] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const prefs = loadPrefs(tableId);
    setVisible({ ...defaultVisible, ...(prefs.visible ?? {}) });
    if (prefs.sort) setSort(prefs.sort);
    setHydrated(true);
  }, [tableId, defaultVisible]);

  useEffect(() => {
    if (!hydrated) return;
    savePrefs(tableId, { visible, sort });
  }, [tableId, visible, sort, hydrated]);

  const visibleColumns = useMemo(
    () => columns.filter((c) => visible[c.id] !== false),
    [columns, visible],
  );

  const colSpan =
    visibleColumns.length + (renderExpandedRow ? 1 : 0);

  const processed = useMemo(() => {
    const q = filter.trim().toLowerCase();
    let list = rows;
    if (q) {
      list = rows.filter((row) =>
        columns.some((col) => {
          if (visible[col.id] === false) return false;
          const raw =
            col.getFilterValue?.(row) ?? col.getSortValue?.(row) ?? "";
          return toFilterString(raw).includes(q);
        }),
      );
    }
    if (sort) {
      const col = columns.find((c) => c.id === sort.id);
      if (col?.getSortValue) {
        const dir = sort.dir === "asc" ? 1 : -1;
        list = [...list].sort(
          (a, b) =>
            dir * compareValues(col.getSortValue!(a), col.getSortValue!(b)),
        );
      }
    }
    return list;
  }, [rows, columns, filter, sort, visible]);

  const toggleSort = (col: AdminColumn<T>) => {
    if (col.disableSort || !col.getSortValue) return;
    setSort((prev) => {
      if (!prev || prev.id !== col.id) return { id: col.id, dir: "asc" };
      if (prev.dir === "asc") return { id: col.id, dir: "desc" };
      return null;
    });
  };

  const setColumnVisible = (id: string, next: boolean) => {
    setVisible((prev) => {
      const currentlyOn = columns.filter((c) => prev[c.id] !== false).length;
      if (!next && currentlyOn <= 1) return prev;
      return { ...prev, [id]: next };
    });
  };

  return (
    <VStack align="stretch" spacing={3} width="100%">
      <HStack
        justify="space-between"
        align="center"
        flexWrap="wrap"
        gap={2}
        px={1}
      >
        <HStack flex="1" minW="200px" maxW="420px" spacing={2}>
          {toolbarLeft}
          <Input
            size="sm"
            placeholder="Filter…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            bg="white"
          />
        </HStack>
        <HStack spacing={2}>
          <Text fontSize="xs" color="gray.500">
            {processed.length}
            {processed.length !== rows.length ? ` / ${rows.length}` : ""} rows
          </Text>
          <Menu closeOnSelect={false}>
            <MenuButton
              as={Button}
              size="sm"
              variant="outline"
              rightIcon={<ChevronDownIcon />}
            >
              Columns
            </MenuButton>
            <MenuList maxH="320px" overflowY="auto" zIndex={20}>
              {columns.map((col) => (
                <MenuItem
                  key={col.id}
                  closeOnSelect={false}
                  onClick={(e) => e.preventDefault()}
                >
                  <Checkbox
                    isChecked={visible[col.id] !== false}
                    onChange={(e) =>
                      setColumnVisible(col.id, e.target.checked)
                    }
                  >
                    {col.header}
                  </Checkbox>
                </MenuItem>
              ))}
            </MenuList>
          </Menu>
        </HStack>
      </HStack>

      <Box
        bg="white"
        borderRadius="md"
        boxShadow="sm"
        overflowX="auto"
        width="100%"
      >
        <Table size="sm">
          <Thead>
            <Tr>
              {renderExpandedRow ? (
                <Th w="36px" px={1} aria-label="Expand" />
              ) : null}
              {visibleColumns.map((col) => {
                const sortable = Boolean(col.getSortValue) && !col.disableSort;
                const active = sort?.id === col.id;
                return (
                  <Th
                    key={col.id}
                    minW={col.minW}
                    maxW={col.maxW}
                    whiteSpace={col.whiteSpace ?? "nowrap"}
                    cursor={sortable ? "pointer" : "default"}
                    userSelect="none"
                    onClick={() => toggleSort(col)}
                    title={sortable ? "Click to sort" : undefined}
                  >
                    <HStack spacing={1} as="span">
                      <Text as="span">{col.header}</Text>
                      {active ? (
                        sort?.dir === "asc" ? (
                          <TriangleUpIcon boxSize={2.5} />
                        ) : (
                          <TriangleDownIcon boxSize={2.5} />
                        )
                      ) : null}
                    </HStack>
                  </Th>
                );
              })}
            </Tr>
          </Thead>
          <Tbody>
            {processed.length === 0 ? (
              <Tr>
                <Td colSpan={Math.max(colSpan, 1)}>
                  <Text color="gray.500" py={4} textAlign="center">
                    {emptyMessage}
                  </Text>
                </Td>
              </Tr>
            ) : (
              processed.map((row) => {
                const id = getRowId(row);
                const expanded = Boolean(isRowExpanded?.(row));
                return (
                  <Fragment key={id}>
                    <Tr
                      bg={isRowSelected?.(row) ? "blue.50" : undefined}
                      cursor={onRowClick ? "pointer" : undefined}
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                      _hover={
                        onRowClick
                          ? {
                              bg: isRowSelected?.(row) ? "blue.50" : "gray.50",
                            }
                          : undefined
                      }
                    >
                      {renderExpandedRow ? (
                        <Td
                          w="36px"
                          px={1}
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleExpand?.(row);
                          }}
                        >
                          <IconButton
                            aria-label={expanded ? "Collapse" : "Expand"}
                            icon={
                              expanded ? (
                                <ChevronDownIcon />
                              ) : (
                                <ChevronRightIcon />
                              )
                            }
                            size="xs"
                            variant="ghost"
                          />
                        </Td>
                      ) : null}
                      {visibleColumns.map((col) => (
                        <Td
                          key={col.id}
                          minW={col.minW}
                          maxW={col.maxW}
                          whiteSpace={col.whiteSpace}
                        >
                          {col.cell(row)}
                        </Td>
                      ))}
                    </Tr>
                    {renderExpandedRow && expanded ? (
                      <Tr bg="gray.50">
                        <Td colSpan={colSpan} py={3} px={4}>
                          {renderExpandedRow(row)}
                        </Td>
                      </Tr>
                    ) : null}
                  </Fragment>
                );
              })
            )}
          </Tbody>
        </Table>
      </Box>
    </VStack>
  );
}
