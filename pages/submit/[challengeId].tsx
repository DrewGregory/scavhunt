import {
  Alert,
  Button,
  Checkbox,
  FormControl,
  FormHelperText,
  FormLabel,
  Input,
  VStack,
  Card,
} from "@chakra-ui/react";
import axios from "axios";
import { useRouter } from "next/router";
import { useRef, useState } from "react";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { dbConnect } from "../../lib/dbConnect";
import { ChallengeModel } from "../../models/Challenge";
import { submissionResponseBodySchema } from "../../lib/types";
import { TEAM_COOKIE_NAME } from "../../lib/team";
import NavContainer from "../../components/NavContainer";

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
  const [note, setNote] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [skipUpload, setSkipUpload] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();

  const handleSubmit = async () => {
    if (!file && !skipUpload) {
      setResult({ success: false, message: "Please select a file to upload." });
      return;
    }

    setIsSubmitting(true);
    setResult(null);

    const formData = new FormData();
    const challengeId = router.query.challengeId as string;

    if (skipUpload) {
      formData.append("skipUpload", "true");
    } else {
      formData.append("file", file as File);
      formData.append("skipUpload", "false");
    }
    formData.append("note", note);
    formData.append("challengeId", challengeId);

    try {
      const result = await axios.post("/api/upload", formData, {
        headers: {
          "Content-Type": "multipart/form-data"
        }
      });

      const response = submissionResponseBodySchema.parse(result.data);
      if (response.status === "error") {
        setResult({ success: false, message: response.message });
      } else {
        setNote("");
        setFile(null);
        setSkipUpload(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = ""; // Clear the file input value
        }
        setResult({ success: true, message: response.message });
        // Redirect home after 2 seconds
        setTimeout(() => {
          router.push("/");
        }, 2000);
      }
    } catch (err: unknown) {
        if (typeof err === "object" && err != null && "response" in err && err.response) {
          const { response } = err;
          if (typeof response === "object" && response != null && "data" in response && response.data) {
            const responseParse = submissionResponseBodySchema.safeParse(
              response.data
            );
            if (responseParse.success) {
              setResult({ success: false, message: responseParse.data.message });
              return;
            }
          }
        }
      setResult({
        success: false,
        message: `Upload failed. Error: ${
          typeof err === "object" && err != null && "message" in err ? err.message : "Unknown error - try again?"
        }`
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <NavContainer title={challenge.title}>
      <Card p={5}>
        <VStack>
          <FormControl as="fieldset">
            <FormLabel as="legend">Upload video</FormLabel>
            <Input
              type="file"
              accept="image/*,video/*"
              disabled={skipUpload}
              onChange={(e) => {
                const { files } = e.target;
                if (files != null && files.length === 1) {
                  setFile(files[0]);
                }
              }}
              ref={fileInputRef}
            />
          </FormControl>
          <FormControl as="fieldset">
            <Checkbox
              isChecked={skipUpload}
              onChange={(e) => {
                setSkipUpload(e.target.checked);
                if (fileInputRef.current) {
                  fileInputRef.current.value = ""; // Clear the file input value
                }
              }}
            >
              Skip upload
            </Checkbox>
            <FormHelperText>
              If you're having trouble uploading your video, you can skip it —
              but please still take and send videos to us! We're hoping to save
              them as a memory and maybe make a video out of it!
            </FormHelperText>
          </FormControl>
          <FormControl as="fieldset">
            <FormLabel as="legend">Add note</FormLabel>
            <Input
              type="text"
              onChange={(e) => setNote(e.target.value)}
              value={note}
            />
          </FormControl>
          {result && (
            <Alert status={result.success ? "success" : "error"}>
              {result.message}
            </Alert>
          )}
          <Button onClick={handleSubmit} isLoading={isSubmitting}>
            Submit
          </Button>
        </VStack>
      </Card>
    </NavContainer>
  );
}
