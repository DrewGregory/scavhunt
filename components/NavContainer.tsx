import React, { ReactNode } from "react";
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
  Heading,
  Divider
} from "@chakra-ui/react";
import { FiMenu } from "react-icons/fi";
import {
  Gi3dMeeple,
  GiTreasureMap,
  GiPodium,
  GiNotebook,
  GiHouse,
  GiRuleBook
} from "react-icons/gi";
import { FaVideo } from "react-icons/fa";
import { IconType } from "react-icons";
import { useRouter } from "next/router";
import { useTeam } from "./useTeam";

interface LinkItemProps {
  name: string;
  icon: IconType;
  url: string;
}
const LinkItems: Array<LinkItemProps> = [
  { name: "Home", icon: GiHouse, url: "/" },
  { name: "ScavTok", icon: FaVideo, url: "/scavtok" },
  { name: "Challenges", icon: GiNotebook, url: "/challenges" },
  { name: "Leaderboard", icon: GiPodium, url: "/teams" },
  { name: "Map", icon: GiTreasureMap, url: "/map" },
  { name: "How to Play", icon: GiRuleBook, url: "/how-to-play" }
];

export default function NavContainer({
  title,
  children,
  fullScreen,
  bgColor,
  hgt
}: {
  title: string;
  children: ReactNode;
  fullScreen?: boolean;
  bgColor?: string;
  hgt?: string;
}) {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const team = useTeam();
  return (
    <Box height="100dvh" bg={bgColor ? bgColor : useColorModeValue("gray.100", "gray.900")}>
      <SidebarContent
        title={"Scavhunt"}
        onClose={() => onClose}
        display={{ base: "none", md: "block" }}
      />
      <Drawer
        isOpen={isOpen}
        placement="left"
        onClose={onClose}
        returnFocusOnClose={false}
        onOverlayClick={onClose}
        size="full"
      >
        <DrawerContent>
          <SidebarContent title={"Scavhunt"} onClose={onClose} />
        </DrawerContent>
      </Drawer>
      <MobileNav
        display={{ base: "flex", md: "none" }}
        height="10dvh"
        title={title}
        onOpen={onOpen}
      />
      <Flex
        display={{ base: "none", md: "flex" }}
        width="80vw"
        ml="20vw"
        p={4}
        height="10dvh"
        alignItems="center"
        flexDirection="row"
        backgroundColor={bgColor ? bgColor : "white"}
      >
        <Text flex={1} fontSize="2xl" fontFamily="monospace" fontWeight="bold">
          {title}
        </Text>
        {team && <Text>{team.emoji}</Text>}
      </Flex>
      <Box
        ml={{ base: 0, md: "20vw" }}
        p={fullScreen ? 0 : 4}
        width={{ base: "100vw", md: "80vw" }}
        height={hgt ? hgt : "90dvh"}
        overflow="scroll"
        background={bgColor ? bgColor : "white"}
        pb={"150px"}
      >
        {children}
      </Box>
    </Box>
  );
}

interface SidebarProps extends BoxProps {
  onClose: () => void;
}

const SidebarContent = ({
  onClose,
  title,
  ...rest
}: SidebarProps & { title: string }) => {
  const router = useRouter();
  const team = useTeam();

  return (
    <Box
      bg={useColorModeValue("white", "gray.900")}
      borderRight="1px"
      borderRightColor={useColorModeValue("gray.200", "gray.700")}
      w={{ base: "full", md: "20vw" }}
      pos="fixed"
      h="full"
      {...rest}
    >
      <Flex h="20" alignItems="center" mx="8" justifyContent="space-between">
        <Gi3dMeeple size="32" />
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
      {team && (
        <Flex px={4} mx={4} mb={4} direction="row" alignContent="center">
          <Text fontWeight="bold" mr={1}>
            Playing as:
          </Text>
          <Text>
            {team.emoji} {team.name}
          </Text>
        </Flex>
      )}
      <Divider />
      {LinkItems.map((link) => (
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
  pink: "#f8d3d1"
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
          bg: colors.green
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
}
const MobileNav = ({ onOpen, title, ...rest }: MobileProps) => {
  const team = useTeam();
  return (
    <Flex
      m={{ base: 0, md: "20vw" }}
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
      {team && <Text>{team.emoji}</Text>}
    </Flex>
  );
};
