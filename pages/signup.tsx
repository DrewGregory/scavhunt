import {
  Box,
  Button,
  Container,
  FormControl,
  FormLabel,
  Heading,
  Input,
  Link,
  Stack,
  Text,
  VStack,
} from "@chakra-ui/react";
import NextLink from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";
import { isBirdMockClient } from "../lib/bird";
import { formatPhoneInput } from "../lib/phone";

type Channel = "sms" | "email";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [channel, setChannel] = useState<Channel>("sms");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"form" | "code">("form");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const mock = isBirdMockClient();

  async function sendCode(
    e: React.FormEvent | null,
    nextChannel: Channel = "sms",
  ) {
    if (e) e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/signup/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          phone,
          channel: nextChannel,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not send code");
        return false;
      }
      setChannel(nextChannel);
      setStep("code");
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/signup/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, phone, channel, code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not verify code");
        return;
      }
      await router.push("/?survey=1");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box minH="100vh" bg="gray.50" py={12}>
      <Container maxW="md">
        <VStack
          spacing={6}
          align="stretch"
          bg="white"
          p={8}
          borderRadius="xl"
          boxShadow="md"
        >
          <Heading size="lg">Sign up</Heading>
          <Text color="gray.600">
            Create an account with your name, email, and phone. We&apos;ll text
            a one-time code to verify.
          </Text>

          {step === "form" ? (
            <Stack as="form" spacing={4} onSubmit={(e) => sendCode(e, "sms")}>
              <FormControl isRequired>
                <FormLabel>Name</FormLabel>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                />
              </FormControl>
              <FormControl isRequired>
                <FormLabel>Email</FormLabel>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@email.com"
                />
              </FormControl>
              <FormControl isRequired>
                <FormLabel>Phone</FormLabel>
                <Input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
                  placeholder="(555) 123-4567"
                />
              </FormControl>
              <Button type="submit" colorScheme="blue" isLoading={busy}>
                {mock ? "Continue" : "Send code"}
              </Button>
            </Stack>
          ) : (
            <Stack as="form" spacing={4} onSubmit={verifyCode}>
              <Text fontSize="sm" color="gray.600">
                {mock
                  ? "Local mock is on. Use code 000000."
                  : channel === "email"
                    ? `Code sent to ${email}`
                    : `Code sent to ${phone}`}
              </Text>
              <FormControl isRequired>
                <FormLabel>Verification code</FormLabel>
                <Input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="6-digit code"
                />
              </FormControl>
              <Button type="submit" colorScheme="blue" isLoading={busy}>
                Create account
              </Button>
              {channel === "sms" ? (
                <Button
                  type="button"
                  variant="link"
                  isDisabled={busy}
                  onClick={async () => {
                    setCode("");
                    setError("");
                    await sendCode(null, "email");
                  }}
                >
                  Didn&apos;t get a text? Use email instead
                </Button>
              ) : null}
              <Button
                type="button"
                variant="link"
                onClick={() => {
                  setStep("form");
                  setChannel("sms");
                  setCode("");
                  setError("");
                }}
              >
                Back
              </Button>
            </Stack>
          )}

          {error ? (
            <Text color="red.500" fontSize="sm">
              {error}
            </Text>
          ) : null}

          <Text fontSize="sm" color="gray.600">
            Already have an account?{" "}
            <Link as={NextLink} href="/login" color="blue.500">
              Log in
            </Link>
          </Text>
        </VStack>
      </Container>
    </Box>
  );
}
