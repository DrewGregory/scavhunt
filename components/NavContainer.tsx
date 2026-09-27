import React, { ReactNode, useEffect, useState } from "react";
import {
  IconButton,
  Box,
  CloseButton,
  Flex,
  Icon,
  useColorModeValue,
  Text,
  Drawer,
  DrawerContent,
  useDisclosure,
  BoxProps,
  FlexProps,
  Divider,
  Button,
  Tooltip,
} from "@chakra-ui/react";
import {
  LuBookOpen,
  LuChevronLeft,
  LuChevronRight,
  LuListChecks,
  LuLogOut,
  LuMegaphone,
  LuMenu,
  LuNewspaper,
  LuShieldCheck,
  LuTrophy,
  LuUsers,
} from "react-icons/lu";
import { IconType } from "react-icons";
import { useRouter } from "next/router";
import { useSession } from "./useSession";
import Image from "next/image";
import { AnnouncementModal } from "./AnnouncementModal";

interface LinkItemProps {
  name: string;
  icon: IconType;
  url: string;
  adminOnly?: boolean;
  matchPaths?: string[];
}

const LinkItems: Array<LinkItemProps> = [
  {
    name: "Feed",
    icon: LuNewspaper,
    url: "/feed",
    matchPaths: ["/feed", "/scavtok"],
  },
  {
    name: "Announcements",
    icon: LuMegaphone,
    url: "/announcements",
  },
  {
    name: "Challenges",
    icon: LuListChecks,
    url: "/challenges",
    matchPaths: ["/challenges", "/map"],
  },
  { name: "Leaderboard", icon: LuTrophy, url: "/teams" },
  { name: "My Team", icon: LuUsers, url: "/my-team" },
  { name: "How to Play", icon: LuBookOpen, url: "/how-to-play" },
  { name: "Admin", icon: LuShieldCheck, url: "/admin", adminOnly: true },
];

const SIDEBAR_EXPANDED = "20vw";
const SIDEBAR_COLLAPSED = "72px";
const STORAGE_KEY = "scavhunt.sidebarCollapsed";

export default function NavContainer({
  title,
  children,
  fullScreen,
  bgColor,
  hgt,
  hideTopBar,
  hideMenu,
  right,
}: {
  title: string;
  children: ReactNode;
  fullScreen?: boolean;
  bgColor?: string;
  hgt?: string;
  hideTopBar?: boolean;
  /** Hide the floating mobile menu button (e.g. immersive ScavTok). */
  hideMenu?: boolean;
  /** Optional actions rendered on the right side of the top navbar. */
  right?: ReactNode;
}) {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const session = useSession();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const sidebarW = collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED;

  return (
    <Box
      height="100dvh"
      bg={bgColor ? bgColor : useColorModeValue("gray.100", "gray.900")}
    >
      <SidebarContent
        title={"Scavhunt"}
        onClose={() => onClose}
        display={{ base: "none", md: "block" }}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
        w={sidebarW}
      />
      <Drawer
        isOpen={isOpen}
        placement="left"
        onClose={onClose}
        returnFocusOnClose={false}
        onOverlayClick={onClose}
        size="full"
      >
        <DrawerContent overflowY="auto">
          <SidebarContent
            title={"Scavhunt"}
            onClose={onClose}
            collapsed={false}
          />
        </DrawerContent>
      </Drawer>
      {!hideTopBar && (
        <MobileNav
          display={{ base: "flex", md: "none" }}
          height="10dvh"
          title={title}
          onOpen={onOpen}
          rightSlot={right}
        />
      )}
      {hideTopBar && !hideMenu && (
        <IconButton
          display={{ base: "inline-flex", md: "none" }}
          position="fixed"
          top={4}
          left={4}
          zIndex={10}
          variant="solid"
          onClick={onOpen}
          aria-label="open menu"
          icon={<LuMenu />}
          bg="whiteAlpha.600"
          backdropFilter="blur(8px)"
          _hover={{ bg: "whiteAlpha.700" }}
        />
      )}
      {!hideTopBar && (
        <Flex
          display={{ base: "none", md: "flex" }}
          width={`calc(100vw - ${sidebarW})`}
          ml={sidebarW}
          p={4}
          height="10dvh"
          alignItems="center"
          flexDirection="row"
          backgroundColor={bgColor ? bgColor : "white"}
          gap={3}
          transition="margin-left 0.2s ease, width 0.2s ease"
        >
          <Text flex={1} fontSize="2xl" fontWeight="bold">
            {title}
          </Text>
          {right}
        </Flex>
      )}
      <Box
        data-nav-scroll
        ml={{ base: 0, md: sidebarW }}
        p={fullScreen ? 0 : 4}
        width={{ base: "100vw", md: `calc(100vw - ${sidebarW})` }}
        height={hgt ? hgt : hideTopBar ? "100dvh" : "90dvh"}
        overflow={fullScreen ? "hidden" : "scroll"}
        background={bgColor ? bgColor : "white"}
        pb={fullScreen ? 0 : "150px"}
        display={fullScreen ? "flex" : "block"}
        flexDirection={fullScreen ? "column" : undefined}
        transition="margin-left 0.2s ease, width 0.2s ease"
      >
        {children}
      </Box>
      {session?.user ? <AnnouncementModal /> : null}
    </Box>
  );
}

interface SidebarProps extends BoxProps {
  onClose: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

const SidebarContent = ({
  onClose,
  title,
  collapsed = false,
  onToggleCollapse,
  ...rest
}: SidebarProps & { title: string }) => {
  const router = useRouter();
  const session = useSession();

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  return (
    <Box
      bg={useColorModeValue("white", "gray.900")}
      borderRight="1px"
      borderRightColor={useColorModeValue("gray.200", "gray.700")}
      w={{ base: "full", md: collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED }}
      pos="fixed"
      h="full"
      overflowX="hidden"
      transition="width 0.2s ease"
      display="flex"
      flexDirection="column"
      {...rest}
    >
      <Flex
        h="20"
        alignItems="center"
        mx={collapsed ? 2 : 8}
        justifyContent={collapsed ? "center" : "space-between"}
        gap={2}
        flexShrink={0}
      >
        <Flex
          as="button"
          type="button"
          alignItems="center"
          gap={2}
          flex={collapsed ? undefined : 1}
          minW={0}
          cursor="pointer"
          onClick={() => {
            router.push("/");
            onClose();
          }}
          aria-label="Home"
          _hover={{ opacity: 0.85 }}
        >
          <Box position="relative" width="32px" height="32px" flexShrink={0}>
            <Image
              src="/favicon.ico"
              alt=""
              width={32}
              height={32}
              style={{ objectFit: "contain" }}
            />
          </Box>
          {!collapsed && (
            <Text fontSize="2xl" fontWeight="bold" noOfLines={1}>
              {title}
            </Text>
          )}
        </Flex>
        <CloseButton display={{ base: "flex", md: "none" }} onClick={onClose} />
      </Flex>
      {session && !collapsed && (
        <Flex px={4} mx={4} mb={4} direction="column" gap={1} flexShrink={0}>
          <Text fontWeight="bold" fontSize="sm">
            {session.user.name}
          </Text>
          {session.team && (
            <Text fontSize="sm" fontWeight="bold">
              {session.team.emoji} {session.team.name}
            </Text>
          )}
        </Flex>
      )}
      {session && collapsed && (
        <Flex direction="column" align="center" gap={2} mb={3} px={1} flexShrink={0}>
          {session.team && (
            <Text fontSize="lg" title={session.team.name}>
              {session.team.emoji}
            </Text>
          )}
        </Flex>
      )}
      <Divider flexShrink={0} />
      <Box flex={1} overflowY="auto" minH={0} py={1}>
        {LinkItems.filter(
          (link) => !link.adminOnly || session?.user.isAdmin,
        ).map((link) => {
          const paths = link.matchPaths ?? [link.url];
          const active = paths.some(
            (p) =>
              router.pathname === p || router.asPath.split("?")[0] === p,
          );
          return (
            <NavItem
              key={link.name}
              icon={link.icon}
              collapsed={collapsed}
              label={link.name}
              bg={active ? colors.green : undefined}
              onClick={() => {
                router.push(`${link.url}`);
              }}
            >
              {link.name}
            </NavItem>
          );
        })}
        {onToggleCollapse && (
          <Box
            display={{ base: "none", md: "block" }}
            mt={4}
            mb={2}
            mx={collapsed ? 1 : 4}
          >
            <Tooltip
              label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              placement="right"
              hasArrow
            >
              <Box w="100%">
                <IconButton
                  aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                  icon={collapsed ? <LuChevronRight /> : <LuChevronLeft />}
                  size="sm"
                  variant="outline"
                  borderColor="gray.300"
                  bg="white"
                  _hover={{ bg: "gray.50" }}
                  onClick={onToggleCollapse}
                  w="100%"
                />
              </Box>
            </Tooltip>
          </Box>
        )}
      </Box>
      {session && (
        <Box
          flexShrink={0}
          px={collapsed ? 1 : 4}
          py={4}
          borderTopWidth="1px"
          borderTopColor={useColorModeValue("gray.200", "gray.700")}
        >
          {collapsed ? (
            <Tooltip label="Log out" placement="right" hasArrow>
              <IconButton
                aria-label="Log out"
                icon={<LuLogOut />}
                size="sm"
                variant="outline"
                onClick={handleLogout}
                w="100%"
              />
            </Tooltip>
          ) : (
            <Button
              size="sm"
              variant="outline"
              leftIcon={<LuLogOut />}
              onClick={handleLogout}
              width="100%"
              fontWeight="bold"
            >
              Log out
            </Button>
          )}
        </Box>
      )}
    </Box>
  );
};

const colors = {
  red: "#df9f85",
  yellow: "#f4e4ad",
  green: "#c4f3c7",
  blue: "#e1fafe",
  pink: "#f8d3d1",
};

interface NavItemProps extends FlexProps {
  icon: IconType;
  children: string;
  collapsed?: boolean;
  label?: string;
}
const NavItem = ({
  icon,
  children,
  collapsed,
  label,
  ...rest
}: NavItemProps) => {
  const content = (
    <Flex
      align="center"
      justify={collapsed ? "center" : "flex-start"}
      p="4"
      mx={collapsed ? 1 : 4}
      borderRadius="lg"
      role="group"
      cursor="pointer"
      _hover={{
        bg: colors.green,
      }}
      {...rest}
    >
      {icon && (
        <Icon
          mr={collapsed ? 0 : 4}
          fontSize="16"
          color="black"
          as={icon}
        />
      )}
      {!collapsed && (
        <Text fontWeight="bold" fontSize="md">
          {children}
        </Text>
      )}
    </Flex>
  );

  return (
    <Box
      as="a"
      href="#"
      style={{ textDecoration: "none" }}
      _focus={{ boxShadow: "none" }}
    >
      {collapsed ? (
        <Tooltip label={label ?? children} placement="right">
          {content}
        </Tooltip>
      ) : (
        content
      )}
    </Box>
  );
};

interface MobileProps extends FlexProps {
  onOpen: () => void;
  rightSlot?: ReactNode;
}
const MobileNav = ({
  onOpen,
  title,
  rightSlot,
  ...rest
}: MobileProps) => {
  return (
    <Flex
      ml={{ base: 0, md: SIDEBAR_EXPANDED }}
      px={{ base: 4, md: 24 }}
      pr={4}
      height="20"
      alignItems="center"
      bg={useColorModeValue("white", "gray.900")}
      borderBottomWidth="1px"
      borderBottomColor={useColorModeValue("gray.200", "gray.700")}
      justifyContent="flex-start"
      gap={2}
      {...rest}
    >
      <IconButton
        variant="outline"
        onClick={onOpen}
        aria-label="open menu"
        icon={<LuMenu />}
      />

      <Text
        fontSize="2xl"
        ml="8"
        fontWeight="bold"
        flex={1}
        noOfLines={1}
      >
        {title}
      </Text>
      {rightSlot}
    </Flex>
  );
};
