import { Button, Heading, HStack, VStack } from "@chakra-ui/react";
import type {
  GetServerSidePropsContext,
  InferGetServerSidePropsType,
} from "next";
import Link from "next/link";
import NavContainer from "../../components/NavContainer";
import ChallengeDraftBoard from "../../components/ChallengeDraftBoard";
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

export default function AdminChallengesDraftPage({
  user: _user,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <NavContainer title="Challenge draft">
      <VStack align="stretch" spacing={4} width="100%">
        <HStack justify="space-between" flexWrap="wrap" gap={2}>
          <Heading size="lg">Challenge draft board</Heading>
          <Button as={Link} href="/admin" size="sm" variant="outline">
            ← Admin
          </Button>
        </HStack>
        <Text fontSize="sm" color="gray.600">
          Dump prior-year challenges into <strong>Disabled</strong>, edit
          inline, place on the map, then drag into <strong>Enabled</strong> when
          ready for players. Right-click the map to create at a pin.
        </Text>
        <ChallengeDraftBoard />
      </VStack>
    </NavContainer>
  );
}
