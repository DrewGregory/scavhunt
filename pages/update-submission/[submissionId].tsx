import {
  VStack,
  Card,
  Text,
  Box,
  Image,
} from "@chakra-ui/react";
import { useRouter } from "next/router";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import NavContainer from "../../components/NavContainer";
import MediaUploadForm from "../../components/MediaUploadForm";
import { prisma } from "../../lib/prisma";
import { requireUserSSP } from "../../lib/auth";

export const getServerSideProps: GetServerSideProps = async (context) => {
  const auth = await requireUserSSP(context);
  if (auth.redirect) return { redirect: auth.redirect };

  const user = auth.user;

  const submissionId = context.query.submissionId;
  if (!submissionId || typeof submissionId !== "string") {
    return {
      redirect: {
        destination: "/",
        permanent: false,
      },
    };
  }

  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
  });
  if (submission == null) {
    return {
      redirect: {
        destination: "/",
        permanent: false,
      },
    };
  }

  const isOriginalTeam =
    user.teamId != null && submission.teamId === user.teamId;
  if (!user.isAdmin && !isOriginalTeam) {
    return {
      redirect: {
        destination: "/",
        permanent: false,
      },
    };
  }

  const challenge = await prisma.challenge.findUnique({
    where: { id: submission.challengeId },
  });
  if (challenge == null) {
    return {
      redirect: {
        destination: "/",
        permanent: false,
      },
    };
  }

  return {
    props: {
      submission: {
        id: submission.id,
        mediaURL: submission.mediaURL ?? null,
        note: submission.note,
        challengeId: submission.challengeId,
      },
      challenge: {
        id: challenge.id,
        title: challenge.title,
      },
    },
  };
};

export default function UpdateSubmission({
  submission,
  challenge,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();

  return (
    <NavContainer title={`Update Submission - ${challenge.title}`}>
      <Card p={6} boxShadow="sm" borderRadius="lg" bg="white">
        <VStack spacing={5}>
          <Text
            fontSize="xl"
            fontWeight="semibold"
            color="gray.800"
            alignSelf="flex-start"
          >
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
                      maxWidth: "600px",
                    }}
                  />
                )}
                {!submission.mediaURL.match(/\.(jpg|jpeg|png|gif)$/i) &&
                  !submission.mediaURL.match(
                    /\.(mpg|mp2|mpeg|mpe|mpv|mp4)$/i,
                  ) && (
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
              formData={{
                submissionId: submission.id,
                challengeId: submission.challengeId,
              }}
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
