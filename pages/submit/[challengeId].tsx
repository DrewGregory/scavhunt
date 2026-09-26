import { Card } from "@chakra-ui/react";
import { useRouter } from "next/router";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import NavContainer from "../../components/NavContainer";
import dynamic from "next/dynamic";
import { prisma } from "../../lib/prisma";
import { requireUserSSP } from "../../lib/auth";
import { requireHuntStartedSSP } from "../../lib/time";

const MediaUploadForm = dynamic(
  () => import("../../components/MediaUploadForm"),
  {
    ssr: false,
  },
);

export const getServerSideProps: GetServerSideProps = async (context) => {
  const auth = await requireUserSSP(context);
  if (auth.redirect) return { redirect: auth.redirect };

  const huntRedirect = await requireHuntStartedSSP(auth.user.isAdmin);
  if (huntRedirect) return { redirect: huntRedirect };

  const challengeId = context.query.challengeId;
  if (!challengeId || typeof challengeId !== "string") {
    return {
      redirect: {
        destination: "/challenges",
        permanent: false,
      },
    };
  }

  const challenge = await prisma.challenge.findUnique({
    where: { id: challengeId },
  });
  if (challenge == null) {
    return {
      redirect: {
        destination: "/challenges",
        permanent: false,
      },
    };
  }

  return {
    props: {
      challenge: {
        title: challenge.title,
      },
    },
  };
};

export default function Submit({
  challenge,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const challengeId = router.query.challengeId as string;

  return (
    <NavContainer title={challenge.title}>
      <Card p={6} boxShadow="sm" borderRadius="lg" bg="white">
        <MediaUploadForm
          apiEndpoint="/api/upload"
          formData={{ challengeId }}
          onSuccess={() => {
            setTimeout(() => {
              router.push("/");
            }, 2000);
          }}
          buttonText="Submit"
          showNoteField={true}
          noteRequired={true}
          showSkipUpload={true}
        />
      </Card>
    </NavContainer>
  );
}
