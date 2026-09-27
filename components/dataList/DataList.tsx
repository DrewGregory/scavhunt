import { Fragment, useMemo, type ReactNode, type Ref } from "react";
import {
  Box,
  Collapse,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
} from "@chakra-ui/react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";

export default function DataList<T>({
  rows,
  columns,
  getRowId,
  expandedId,
  onToggle,
  renderExpanded,
  emptyMessage = "Nothing here",
  rowRef,
  isRowExpandable,
}: {
  rows: T[];
  columns: ColumnDef<T, unknown>[];
  getRowId: (row: T) => string;
  expandedId: string | null;
  onToggle: (id: string) => void;
  renderExpanded: (row: T) => ReactNode;
  emptyMessage?: string;
  /** Optional ref attached to the currently expanded row (for deep-link scroll). */
  rowRef?: Ref<HTMLTableRowElement>;
  isRowExpandable?: (row: T) => boolean;
}) {
  const data = useMemo(() => rows, [rows]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => getRowId(row),
  });

  const colCount = table.getVisibleLeafColumns().length;

  if (rows.length === 0) {
    return (
      <Box
        bg="white"
        borderRadius={{ base: 0, md: "lg" }}
        py={12}
        px={4}
        textAlign="center"
      >
        <Text color="gray.400">{emptyMessage}</Text>
      </Box>
    );
  }

  return (
    <Box
      bg="white"
      borderRadius={{ base: 0, md: "lg" }}
      overflow="hidden"
      w="100%"
      maxW="100%"
    >
      <Table variant="unstyled" size="sm" width="100%">
        <Thead display={{ base: "none", md: "table-header-group" }}>
          {table.getHeaderGroups().map((hg) => (
            <Tr key={hg.id} borderBottomWidth="1px" borderColor="gray.100">
              {hg.headers.map((header) => {
                const meta = header.column.columnDef.meta;
                return (
                  <Th
                    key={header.id}
                    py={2}
                    px={3}
                    fontSize="xs"
                    color="gray.500"
                    fontWeight="semibold"
                    textTransform="uppercase"
                    letterSpacing="wide"
                    isNumeric={meta?.numeric}
                    display={
                      meta?.hideBelow
                        ? { base: "none", [meta.hideBelow]: "table-cell" }
                        : undefined
                    }
                    w={
                      meta?.isTrailing
                        ? "72px"
                        : meta?.isAction
                          ? "40px"
                          : undefined
                    }
                    minW={meta?.isTrailing ? "72px" : undefined}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </Th>
                );
              })}
            </Tr>
          ))}
        </Thead>
        <Tbody>
          {table.getRowModel().rows.map((row) => {
            const id = row.id;
            const expandable = isRowExpandable?.(row.original) ?? true;
            const open = expandable && expandedId === id;
            return (
              <Fragment key={id}>
                <Tr
                  ref={open ? rowRef : undefined}
                  cursor={expandable ? "pointer" : undefined}
                  onClick={() => expandable && onToggle(id)}
                  bg={open ? "gray.50" : undefined}
                  _hover={{ bg: "gray.50" }}
                  borderBottomWidth={open ? 0 : "1px"}
                  borderColor="gray.100"
                >
                  {row.getVisibleCells().map((cell) => {
                    const meta = cell.column.columnDef.meta;
                    return (
                      <Td
                        key={cell.id}
                        py={3}
                        px={3}
                        verticalAlign={
                          meta?.isTrailing
                            ? "top"
                            : meta?.isAction || meta?.numeric
                              ? "middle"
                              : "top"
                        }
                        isNumeric={meta?.numeric}
                        whiteSpace={meta?.numeric ? "nowrap" : undefined}
                        display={
                          meta?.hideBelow
                            ? {
                                base: "none",
                                [meta.hideBelow]: "table-cell",
                              }
                            : undefined
                        }
                        w={
                          meta?.isTrailing
                            ? "72px"
                            : meta?.isAction
                              ? "40px"
                              : undefined
                        }
                        minW={meta?.isTrailing ? "72px" : undefined}
                        h={meta?.isTrailing ? "1px" : undefined}
                        px={meta?.isTrailing ? 1 : 3}
                        onClick={
                          meta?.isAction || meta?.isTrailing
                            ? (e) => e.stopPropagation()
                            : undefined
                        }
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </Td>
                    );
                  })}
                </Tr>
                <Tr>
                  <Td
                    colSpan={colCount}
                    p={0}
                    borderBottomWidth="1px"
                    borderColor="gray.100"
                  >
                    <Collapse in={open} animateOpacity unmountOnExit>
                      <Box px={3} pb={3} pt={1} bg="gray.50">
                        {renderExpanded(row.original)}
                      </Box>
                    </Collapse>
                  </Td>
                </Tr>
              </Fragment>
            );
          })}
        </Tbody>
      </Table>
    </Box>
  );
}
