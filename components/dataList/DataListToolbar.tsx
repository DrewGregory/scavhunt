import { useEffect, useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerHeader,
  DrawerOverlay,
  Flex,
  HStack,
  Input,
  Menu,
  MenuButton,
  MenuItemOption,
  MenuList,
  MenuOptionGroup,
  Tag,
  TagCloseButton,
  TagLabel,
  Text,
  useBreakpointValue,
  useDisclosure,
  VStack,
} from "@chakra-ui/react";
import { ChevronDownIcon } from "@chakra-ui/icons";
import type { DataListFilterOption, DataListSortOption } from "./types";

export default function DataListToolbar({
  search,
  onSearchChange,
  searchPlaceholder = "Search…",
  sortOptions,
  sortId,
  onSortChange,
  filterOptions,
  activeFilterIds,
  onToggleFilter,
  onClearFilter,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  sortOptions: DataListSortOption[];
  sortId: string;
  onSortChange: (id: string) => void;
  filterOptions: DataListFilterOption[];
  /** Filters currently on (chip + checked). */
  activeFilterIds: string[];
  onToggleFilter: (id: string) => void;
  onClearFilter: (id: string) => void;
}) {
  const isMobile = useBreakpointValue({ base: true, md: false }) ?? true;
  const sortDrawer = useDisclosure();
  const filterDrawer = useDisclosure();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const el = document.querySelector(
      "[data-nav-scroll]",
    ) as HTMLElement | null;
    if (!el) return;
    const onScroll = () => setScrolled(el.scrollTop > 2);
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const sortLabel =
    sortOptions.find((o) => o.id === sortId)?.label ?? "Sort";

  const filterChipLabels = activeFilterIds
    .map((id) => filterOptions.find((o) => o.id === id))
    .filter(Boolean) as DataListFilterOption[];

  return (
    <Box
      data-sticky-toolbar
      flexShrink={0}
      bg="white"
      px={4}
      pt={3}
      pb={3}
      borderBottomWidth={scrolled ? "1px" : "0"}
      borderColor="gray.100"
      transition="border-color 0.15s ease"
      zIndex={5}
      w="100%"
      maxW="100%"
      overflowX="hidden"
    >
      <VStack align="stretch" spacing={2}>
        <Input
          placeholder={searchPlaceholder}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          bg="gray.50"
          borderColor="gray.200"
          _hover={{ borderColor: "gray.300" }}
          size="md"
        />
        <HStack spacing={2}>
          {isMobile ? (
            <>
              <Button
                size="sm"
                variant="outline"
                rightIcon={<ChevronDownIcon />}
                onClick={sortDrawer.onOpen}
                flexShrink={0}
              >
                Sort: {sortLabel}
              </Button>
              <Button
                size="sm"
                variant="outline"
                rightIcon={<ChevronDownIcon />}
                onClick={filterDrawer.onOpen}
                flexShrink={0}
              >
                Filter
                {activeFilterIds.length > 0
                  ? ` (${activeFilterIds.length})`
                  : ""}
              </Button>
            </>
          ) : (
            <>
              <Menu>
                <MenuButton
                  as={Button}
                  size="sm"
                  variant="outline"
                  rightIcon={<ChevronDownIcon />}
                >
                  Sort: {sortLabel}
                </MenuButton>
                <MenuList minW="200px">
                  <MenuOptionGroup
                    type="radio"
                    value={sortId}
                    onChange={(v) => onSortChange(String(v))}
                  >
                    {sortOptions.map((o) => (
                      <MenuItemOption key={o.id} value={o.id}>
                        {o.label}
                      </MenuItemOption>
                    ))}
                  </MenuOptionGroup>
                </MenuList>
              </Menu>
              <Menu closeOnSelect={false}>
                <MenuButton
                  as={Button}
                  size="sm"
                  variant="outline"
                  rightIcon={<ChevronDownIcon />}
                >
                  Filter
                  {activeFilterIds.length > 0
                    ? ` (${activeFilterIds.length})`
                    : ""}
                </MenuButton>
                <MenuList minW="240px" px={2} py={2}>
                  <VStack align="stretch" spacing={2}>
                    {filterOptions.map((o) => (
                      <Checkbox
                        key={o.id}
                        isChecked={activeFilterIds.includes(o.id)}
                        onChange={() => onToggleFilter(o.id)}
                      >
                        {o.label}
                      </Checkbox>
                    ))}
                  </VStack>
                </MenuList>
              </Menu>
            </>
          )}
        </HStack>
        {filterChipLabels.length > 0 && (
          <Flex gap={2} flexWrap="wrap">
            {filterChipLabels.map((o) => (
              <Tag
                key={o.id}
                size="sm"
                borderRadius="full"
                variant="subtle"
                colorScheme="blue"
              >
                <TagLabel>{o.label}</TagLabel>
                <TagCloseButton onClick={() => onClearFilter(o.id)} />
              </Tag>
            ))}
          </Flex>
        )}
      </VStack>

      <Drawer
        isOpen={sortDrawer.isOpen}
        placement="bottom"
        onClose={sortDrawer.onClose}
      >
        <DrawerOverlay />
        <DrawerContent borderTopRadius="xl" maxH="70dvh">
          <DrawerCloseButton />
          <DrawerHeader>Sort</DrawerHeader>
          <DrawerBody pb={8}>
            <VStack align="stretch" spacing={1}>
              {sortOptions.map((o) => (
                <Button
                  key={o.id}
                  variant={sortId === o.id ? "solid" : "ghost"}
                  colorScheme={sortId === o.id ? "blue" : "gray"}
                  justifyContent="flex-start"
                  onClick={() => {
                    onSortChange(o.id);
                    sortDrawer.onClose();
                  }}
                >
                  {o.label}
                </Button>
              ))}
            </VStack>
          </DrawerBody>
        </DrawerContent>
      </Drawer>

      <Drawer
        isOpen={filterDrawer.isOpen}
        placement="bottom"
        onClose={filterDrawer.onClose}
      >
        <DrawerOverlay />
        <DrawerContent borderTopRadius="xl" maxH="70dvh">
          <DrawerCloseButton />
          <DrawerHeader>Filter</DrawerHeader>
          <DrawerBody pb={8}>
            <VStack align="stretch" spacing={3}>
              {filterOptions.map((o) => (
                <Checkbox
                  key={o.id}
                  isChecked={activeFilterIds.includes(o.id)}
                  onChange={() => onToggleFilter(o.id)}
                  size="lg"
                >
                  <Text fontSize="md">{o.label}</Text>
                </Checkbox>
              ))}
            </VStack>
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </Box>
  );
}
