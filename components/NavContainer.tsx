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
import { FiChevronLeft, FiChevronRight, FiMenu } from "react-icons/fi";
import {
  GiTreasureMap,
  GiPodium,
  GiNotebook,
  GiHouse,
  GiRuleBook,
  GiScrollUnfurled,
} from "react-icons/gi";
import { FaVideo } from "react-icons/fa";
import { IconType } from "react-icons";
import { useRouter } from "next/router";
import { useSession } from "./useSession";
import Image from "next/image";
import { RegistrationSurveyModal } from "./RegistrationSurveyModal";

interface LinkItemProps {
  name: string;
  icon: IconType;
  url: string;
  adminOnly?: boolean;
}

const LinkItems: Array<LinkItemProps> = [
  { name: "Home", icon: GiHouse, url: "/" },
  { name: "Feed", icon: GiScrollUnfurled, url: "/feed" },
  { name: "ScavTok", icon: FaVideo, url: "/scavtok" },
  { name: "Challenges", icon: GiNotebook, url: "/challenges" },
  { name: "Leaderboard", icon: GiPodium, url: "/teams" },
  { name: "Map", icon: GiTreasureMap, url: "/map" },
  { name: "How to Play", icon: GiRuleBook, url: "/how-to-play" },
  { name: "Admin", icon: GiNotebook, url: "/admin", adminOnly: true },
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
}: {
  title: string;
  children: ReactNode;
  fullScreen?: boolean;
  bgColor?: string;
  hgt?: string;
  hideTopBar?: boolean;
}) {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const session = useSession();
  const [surveyOpen, setSurveyOpen] = useState(false);
  const [surveyDoneOverride, setSurveyDoneOverride] = useState<boolean | null>(
    null,
  );
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

  const surveyDone =
    surveyDoneOverride ?? Boolean(session?.user.surveyCompletedAt);
  const surveyLabel = surveyDone ? "Edit survey" : "Player survey";
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
        onOpenSurvey={() => setSurveyOpen(true)}
        surveyLabel={surveyLabel}
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
            onOpenSurvey={() => setSurveyOpen(true)}
            surveyLabel={surveyLabel}
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
          onOpenSurvey={() => setSurveyOpen(true)}
          surveyLabel={surveyLabel}
        />
      )}
      {hideTopBar && (
        <IconButton
          display={{ base: "block", md: "none" }}
          position="fixed"
          top={4}
          left={4}
          zIndex={10}
          variant="solid"
          onClick={onOpen}
          aria-label="open menu"
          icon={<FiMenu />}
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
          <Text flex={1} fontSize="2xl" fontFamily="monospace" fontWeight="bold">
            {title}
          </Text>
        </Flex>
      )}
      <Box
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
      {session?.user ? (
        <RegistrationSurveyModal
          isOpen={surveyOpen}
          onClose={() => setSurveyOpen(false)}
          onCompleted={() => setSurveyDoneOverride(true)}
        />
      ) : null}
    </Box>
  );
}

interface SidebarProps extends BoxProps {
  onClose: () => void;
  onOpenSurvey?: () => void;
  surveyLabel?: string;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

const SidebarContent = ({
  onClose,
  title,
  onOpenSurvey,
  surveyLabel = "Player survey",
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
      overflowY="auto"
      overflowX="hidden"
      transition="width 0.2s ease"
      {...rest}
    >
      <Flex
        h="20"
        alignItems="center"
        mx={collapsed ? 2 : 8}
        justifyContent={collapsed ? "center" : "space-between"}
        gap={2}
      >
        <Box position="relative" width="32px" height="32px" flexShrink={0}>
          <Image
            src="/favicon.ico"
            alt="Logo"
            width={32}
            height={32}
            style={{ objectFit: "contain" }}
          />
        </Box>
        {!collapsed && (
          <Text
            fontSize="2xl"
            ml="2"
            fontFamily="monospace"
            fontWeight="bold"
            flex={1}
          >
            {title}
          </Text>
        )}
        <CloseButton display={{ base: "flex", md: "none" }} onClick={onClose} />
      </Flex>
      {session && !collapsed && (
        <Flex px={4} mx={4} mb={4} direction="column" gap={1}>
          <Text fontWeight="bold" fontSize="sm">
            {session.user.name}
          </Text>
          {session.team && (
            <Text fontSize="sm">
              {session.team.emoji} {session.team.name}
            </Text>
          )}
          {onOpenSurvey ? (
            <Button
              size="sm"
              mt={2}
              variant="outline"
              onClick={onOpenSurvey}
              width="fit-content"
            >
              {surveyLabel}
            </Button>
          ) : null}
          <Button
            size="sm"
            mt={2}
            variant="outline"
            onClick={handleLogout}
            width="fit-content"
          >
            Log out
          </Button>
        </Flex>
      )}
      {session && collapsed && (
        <Flex direction="column" align="center" gap={2} mb={3} px={1}>
          {session.team && (
            <Text fontSize="lg" title={session.team.name}>
              {session.team.emoji}
            </Text>
          )}
        </Flex>
      )}
      <Divider />
      {LinkItems.filter(
        (link) => !link.adminOnly || session?.user.isAdmin,
      ).map((link) => (
        <NavItem
          key={link.name}
          icon={link.icon}
          collapsed={collapsed}
          label={link.name}
          onClick={() => {
            router.push(`${link.url}`);
          }}
        >
          {link.name}
        </NavItem>
      ))}
      {onToggleCollapse && (
        <Flex
          display={{ base: "none", md: "flex" }}
          justify="center"
          mt={4}
          mb={4}
        >
          <Tooltip
            label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            placement="right"
          >
            <IconButton
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              icon={collapsed ? <FiChevronRight /> : <FiChevronLeft />}
              size="sm"
              variant="ghost"
              onClick={onToggleCollapse}
            />
          </Tooltip>
        </Flex>
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
      {!collapsed && children}
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
  onOpenSurvey?: () => void;
  surveyLabel?: string;
}
const MobileNav = ({
  onOpen,
  title,
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
      {...rest}
    >
      <IconButton
        variant="outline"
        onClick={onOpen}
        aria-label="open menu"
        icon={<FiMenu />}
      />

      <Text
        fontSize="2xl"
        ml="8"
        fontFamily="monospace"
        fontWeight="bold"
        flex={1}
      >
        {title}
      </Text>
    </Flex>
  );
};
