import { GetServerSidePropsContext, InferGetServerSidePropsType } from "next";
import {
  Button,
  FormControl,
  Text,
  Textarea,
  useToast,
  VStack,
} from "@chakra-ui/react";
import { useState } from "react";
import NavContainer from "../components/NavContainer";
import { requireUserSSP } from "../lib/auth";

export const getServerSideProps = async (
  context: GetServerSidePropsContext,
) => {
  const auth = await requireUserSSP(context);
  if (auth.redirect) return { redirect: auth.redirect };
  return { props: {} };
};

export default function FeedbackPage(
  _props: InferGetServerSidePropsType<typeof getServerSideProps>,
) {
  const toast = useToast();
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const trimmed = body.trim();
    if (!trimmed) {
      toast({ title: "Write a message first", status: "warning", duration: 2500 });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: trimmed }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: unknown;
        };
        const msg =
          typeof data.error === "string" && data.error.trim()
            ? data.error
            : `Could not send (${res.status})`;
        throw new Error(msg);
      }
      setBody("");
      toast({
        title: "Thanks for the feedback!",
        status: "success",
        duration: 3500,
      });
    } catch (e) {
      toast({
        title: e instanceof Error ? e.message : "Could not send",
        status: "error",
        duration: 4000,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <NavContainer title="Leave feedback">
      <VStack align="stretch" spacing={4} maxW="560px">
        <Text fontSize="md" fontWeight="medium" color="gray.800">
          Tell the organizers what to fix, keep, or try for next year.
        </Text>
        <FormControl>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="So about the waymos..."
            rows={8}
            maxLength={5000}
            aria-label="Your message"
          />
        </FormControl>
        <Button
          colorScheme="blue"
          alignSelf="flex-start"
          onClick={() => void submit()}
          isLoading={submitting}
          isDisabled={!body.trim()}
        >
          Send message
        </Button>
      </VStack>
    </NavContainer>
  );
}
