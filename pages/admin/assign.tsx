import { Button, Heading, HStack, Text, VStack } from "@chakra-ui/react";
import type {
  GetServerSidePropsContext,
  InferGetServerSidePropsType,
} from "next";
import Link from "next/link";
import NavContainer from "../../components/NavContainer";
import TeamAssignBoard from "../../components/TeamAssignBoard";
import { publicUser, requireAdminSSP } from "../../lib/auth";

export const getServerSideProps = async (
  context: GetServerSidePropsContext,
) => {
  const auth = await requireAdminSSP(context);
  if (auth.redirect) return { redirect: auth.redirect };
  return {
    props: {
      user: publicUser(auth.user!),
    },
  };
};

export default function AdminAssignPage({
  user,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <NavContainer title="Assign teams">
      <VStack align="stretch" spacing={4} width="100%">
        <HStack justify="space-between" flexWrap="wrap" gap={2}>
          <Heading size="lg">Assign teams</Heading>
          <HStack>
            <Text fontSize="sm" color="gray.500">
              {user.name}
            </Text>
            <Button as={Link} href="/admin" size="sm" variant="outline">
              ← Admin
            </Button>
          </HStack>
        </HStack>
        <Text fontSize="sm" color="gray.600">
          Drag players from Unassigned into a team, or onto{" "}
          <Text as="span" fontWeight="semibold">
            + New group
          </Text>{" "}
          to instantly create an untitled team (rename inline). Drag back to
          Unassigned to remove from a team.
        </Text>
        <TeamAssignBoard />
      </VStack>
    </NavContainer>
  );
}
