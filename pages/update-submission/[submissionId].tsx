import {
  VStack,
  Card,
  Text,
  Box,
  Image,
} from "@chakra-ui/react";
import { useRouter } from "next/router";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { dbConnect } from "../../lib/dbConnect";
import { SubmissionModel } from "../../models/Submission";
import { ChallengeModel } from "../../models/Challenge";
import { ADMIN_TEAM_ID, TEAM_COOKIE_NAME, getTeamFromCookie } from "../../lib/team";
import NavContainer from "../../components/NavContainer";
import MediaUploadForm from "../../components/MediaUploadForm";

export const getServerSideProps: GetServerSideProps = async (context) => {
  await dbConnect();
  const teamCode = context.req.cookies[TEAM_COOKIE_NAME];
  if (!teamCode) {
    return {
      redirect: {
        destination: "/",
        permanent: false
      }
    };
  }

  const team = await getTeamFromCookie(context.req.cookies);
  if (team == null) {
    return {
      redirect: {
        destination: "/",
        permanent: false
      }
    };
  }

  const submissionId = context.query.submissionId;
  if (!submissionId || typeof submissionId !== "string") {
    return {
      redirect: {
        destination: "/",
        permanent: false
      }
    };
  }

  const submission = await SubmissionModel.findById(submissionId).lean().exec();
  if (submission == null || Array.isArray(submission)) {
    return {
      redirect: {
        destination: "/",
        permanent: false
      }
    };
  }

  // Check if the user is admin OR the original submitter
  const teamId = team._id.toHexString();
  const isAdmin = teamId === ADMIN_TEAM_ID;
  const isOriginalSubmitter = submission.teamId.toString() === teamId;
  
  if (!isAdmin && !isOriginalSubmitter) {
    return {
      redirect: {
        destination: "/",
        permanent: false
      }
    };
  }

  const challenge = await ChallengeModel.findById(submission.challengeId).lean().exec();
  if (challenge == null || Array.isArray(challenge)) {
    return {
      redirect: {
        destination: "/",
        permanent: false
      }
    };
  }

  return {
    props: {
      teamCode,
      submission: {
        _id: submissionId,
        mediaURL: submission.mediaURL ?? null,
        note: submission.note,
        challengeId: submission.challengeId.toString(),
      },
      challenge: {
        _id: challenge._id.toString(),
        title: challenge.title
      }
    }
  };
};

export default function UpdateSubmission({
  submission,
  challenge,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();

  return (
    <NavContainer title={`Update Submission - ${challenge.title}`}>
      <Card p={5}>
        <VStack spacing={4}>
          <Text fontSize="lg" fontWeight="bold">
            Update Video for: {challenge.title}
          </Text>
          
          {submission.mediaURL && (
            <Box width="100%">
              <Text fontSize="sm" mb={2}>Current submission:</Text>
              {submission.mediaURL
                .toLowerCase()
                .match(/\.(jpg|jpeg|png|gif)$/i) && (
                <Image
                  maxWidth="100%"
                  src={submission.mediaURL}
                  alt={submission.note}
                  objectFit="cover"
                />
              )}
              {submission.mediaURL
                .toLowerCase()
                .match(/\.(mpg|mp2|mpeg|mpe|mpv|mov|mp4)$/i) && (
                <Box
                  as="video"
                  controls
                  src={submission.mediaURL}
                  objectFit="contain"
                  sx={{
                    aspectRatio: "16/9",
                    width: "100%"
                  }}
                />
              )}
              {!submission.mediaURL.match(/\.(jpg|jpeg|png|gif)$/i) &&
                !submission.mediaURL.match(/\.(mpg|mp2|mpeg|mpe|mpv|mp4)$/i) && (
                  <a href={submission.mediaURL}>View current media</a>
                )}
            </Box>
          )}

          {!submission.mediaURL && (
            <Text fontSize="sm" color="gray.600">
              No media currently uploaded for this submission.
            </Text>
          )}

          <Box width="100%" borderTop="1px solid" borderColor="gray.200" pt={4}>
            <Text fontSize="sm" fontWeight="bold" mb={2}>Update submission:</Text>
          </Box>

          <MediaUploadForm
            apiEndpoint="/api/update-submission-media"
            formData={{ submissionId: submission._id }}
            onSuccess={() => {
              setTimeout(() => {
                router.push("/");
              }, 2000);
            }}
            buttonText={submission.mediaURL ? "Update" : "Upload"}
            showNoteField={true}
            initialNote={submission.note}
            noteRequired={false}
            showSkipUpload={false}
          />
        </VStack>
      </Card>
    </NavContainer>
  );
}

