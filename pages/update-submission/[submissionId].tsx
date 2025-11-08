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
import { isAdminTeam, TEAM_COOKIE_NAME, getTeamFromCookie } from "../../lib/team";
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
  const isAdmin = isAdminTeam(teamId);
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
      <Card 
        p={6}
        boxShadow="sm"
        borderRadius="lg"
        bg="white"
      >
        <VStack spacing={5}>
          <Text fontSize="xl" fontWeight="semibold" color="gray.800" alignSelf="flex-start">
            Update Video for: {challenge.title}
          </Text>
          
          {submission.mediaURL && (
            <Box 
              width="100%" 
              p={4} 
              bg="gray.50" 
              borderRadius="md"
              borderLeft="3px solid"
              borderColor="gray.300"
            >
              <Text fontSize="sm" fontWeight="medium" color="gray.700" mb={3}>
                Current submission:
              </Text>
              <Box display="flex" justifyContent="center">
                {submission.mediaURL
                  .toLowerCase()
                  .match(/\.(jpg|jpeg|png|gif)$/i) && (
                  <Image
                    maxWidth="100%"
                    maxHeight="400px"
                    src={submission.mediaURL}
                    alt={submission.note}
                    objectFit="contain"
                    borderRadius="md"
                    boxShadow="sm"
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
                    borderRadius="md"
                    boxShadow="sm"
                    sx={{
                      aspectRatio: "16/9",
                      width: "100%",
                      maxWidth: "600px"
                    }}
                  />
                )}
                {!submission.mediaURL.match(/\.(jpg|jpeg|png|gif)$/i) &&
                  !submission.mediaURL.match(/\.(mpg|mp2|mpeg|mpe|mpv|mp4)$/i) && (
                    <Text 
                      as="a" 
                      href={submission.mediaURL}
                      color="blue.600"
                      fontWeight="medium"
                      _hover={{ textDecoration: "underline" }}
                    >
                      View current media
                    </Text>
                  )}
              </Box>
            </Box>
          )}

          {!submission.mediaURL && (
            <Box 
              width="100%" 
              p={4} 
              bg="gray.50" 
              borderRadius="md"
              textAlign="center"
            >
              <Text fontSize="sm" color="gray.600">
                No media currently uploaded for this submission.
              </Text>
            </Box>
          )}

          <Box width="100%" borderTop="1px solid" borderColor="gray.200" pt={4}>
            <Text fontSize="md" fontWeight="semibold" color="gray.700" mb={4}>
              Update submission:
            </Text>
            <MediaUploadForm
              apiEndpoint="/api/update-submission-media"
              formData={{ submissionId: submission._id, challengeId: submission.challengeId }}
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
          </Box>
        </VStack>
      </Card>
    </NavContainer>
  );
}

