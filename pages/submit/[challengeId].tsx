import {
  Card,
} from "@chakra-ui/react";
import { useRouter } from "next/router";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { dbConnect } from "../../lib/dbConnect";
import { ChallengeModel } from "../../models/Challenge";
import { TEAM_COOKIE_NAME } from "../../lib/team";
import NavContainer from "../../components/NavContainer";
import dynamic from "next/dynamic";

// https://nextjs.org/docs/pages/building-your-application/optimizing/lazy-loading#with-no-ssr
const MediaUploadForm = dynamic(() => import("../../components/MediaUploadForm"), {
  ssr: false,
});

export const getServerSideProps: GetServerSideProps = async (context) => {
  await dbConnect();
  const teamCode = context.req.cookies[TEAM_COOKIE_NAME];
  if (!teamCode) {
    return {
      redirect: {
        destination: "/login",
        permanent: false
      }
    };
  }

  // get challengeId from query
  const challengeId = context.query.challengeId;
  if (!challengeId || typeof challengeId !== "string") {
    return {
      redirect: {
        destination: "/challenges",
        permanent: false
      }
    };
  }
  const challenge = await ChallengeModel.findById(challengeId).lean().exec();
  if (challenge == null) {
    return {
      redirect: {
        destination: "/challenges",
        permanent: false
      }
    };
  }

  return {
    props: {
      teamCode,
      challenge: {
        title: challenge.title
      }
    }
  };
};

export default function Submit({
  challenge
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const challengeId = router.query.challengeId as string;

  return (
    <NavContainer title={challenge.title}>
      <Card p={5}>
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
