import React, { ReactNode, useState } from "react";
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
} from "@chakra-ui/react";
import { FiMenu } from "react-icons/fi";
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
  const surveyDone =
    surveyDoneOverride ?? Boolean(session?.user.surveyCompletedAt);
  const surveyLabel = surveyDone ? "Edit survey" : "Player survey";
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
          width="80vw"
          ml="20vw"
          p={4}
          height="10dvh"
          alignItems="center"
          flexDirection="row"
          backgroundColor={bgColor ? bgColor : "white"}
          gap={3}
        >
          <Text flex={1} fontSize="2xl" fontFamily="monospace" fontWeight="bold">
            {title}
          </Text>
          {session?.user ? (
            <Button size="sm" variant="outline" onClick={() => setSurveyOpen(true)}>
              {surveyLabel}
            </Button>
          ) : null}
          {session?.team && <Text>{session.team.emoji}</Text>}
        </Flex>
      )}
      <Box
        ml={{ base: 0, md: "20vw" }}
        p={fullScreen ? 0 : 4}
        width={{ base: "100vw", md: "80vw" }}
        height={hgt ? hgt : (hideTopBar ? "100dvh" : "90dvh")}
        overflow={fullScreen ? "hidden" : "scroll"}
        background={bgColor ? bgColor : "white"}
        pb={fullScreen ? 0 : "150px"}
        display={fullScreen ? "flex" : "block"}
        flexDirection={fullScreen ? "column" : undefined}
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
}

const SidebarContent = ({
  onClose,
  title,
  onOpenSurvey,
  surveyLabel = "Player survey",
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
      w={{ base: "full", md: "20vw" }}
      pos="fixed"
      h="full"
      overflowY="auto"
      {...rest}
    >
      <Flex h="20" alignItems="center" mx="8" justifyContent="space-between">
        <Box position="relative" width="32px" height="32px" flexShrink={0}>
          <Image
            src="/favicon.ico"
            alt="Logo"
            width={32}
            height={32}
            style={{ objectFit: "contain" }}
          />
        </Box>
        <Text
          fontSize="2xl"
          ml="2"
          fontFamily="monospace"
          fontWeight="bold"
          flex={1}
        >
          {title}
        </Text>

        <CloseButton display={{ base: "flex", md: "none" }} onClick={onClose} />
      </Flex>
      {session && (
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
      <Divider />
      {LinkItems.filter(
        (link) => !link.adminOnly || session?.user.isAdmin
      ).map((link) => (
        <NavItem
          key={link.name}
          icon={link.icon}
          onClick={() => {
            router.push(`${link.url}`);
          }}
        >
          {link.name}
        </NavItem>
      ))}
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
}
const NavItem = ({ icon, children, ...rest }: NavItemProps) => {
  return (
    <Box
      as="a"
      href="#"
      style={{ textDecoration: "none" }}
      _focus={{ boxShadow: "none" }}
    >
      <Flex
        align="center"
        p="4"
        mx="4"
        borderRadius="lg"
        role="group"
        cursor="pointer"
        _hover={{
          bg: colors.green,
        }}
        {...rest}
      >
        {icon && <Icon mr="4" fontSize="16" color="black" as={icon} />}
        {children}
      </Flex>
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
  onOpenSurvey,
  surveyLabel = "Player survey",
  ...rest
}: MobileProps) => {
  const session = useSession();
  return (
    <Flex
      ml={{ base: 0, md: "20vw" }}
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
      {session?.user && onOpenSurvey ? (
        <Button size="sm" mr={2} variant="outline" onClick={onOpenSurvey}>
          {surveyLabel}
        </Button>
      ) : null}
      {session?.team && <Text>{session.team.emoji}</Text>}
    </Flex>
  );
};
