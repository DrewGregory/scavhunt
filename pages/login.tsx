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

export default function LoginPage() {
  const router = useRouter();
  const [channel, setChannel] = useState<Channel>("sms");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"identify" | "code">("identify");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [offerEmail, setOfferEmail] = useState(false);
  const mock = isBirdMockClient();

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          channel === "email"
            ? { channel: "email", email }
            : { channel: "sms", phone },
        ),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not send code");
        if (channel === "sms" && data.emailFallback) setOfferEmail(true);
        return;
      }
      setOfferEmail(false);
      setStep("code");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          channel === "email"
            ? { channel: "email", email, code }
            : { channel: "sms", phone, code },
        ),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not verify code");
        return;
      }
      await router.push("/");
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
          <Heading size="lg">Log in</Heading>
          {step === "identify" ? (
            <Text color="gray.600">
              {channel === "email"
                ? "Enter the email you signed up with and we’ll send a code."
                : "Enter the phone number you signed up with and we’ll text a code."}
            </Text>
          ) : null}

          {step === "identify" ? (
            <Stack as="form" spacing={4} onSubmit={sendCode}>
              {channel === "email" ? (
                <FormControl isRequired>
                  <FormLabel>Email</FormLabel>
                  <Input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@email.com"
                  />
                </FormControl>
              ) : (
                <FormControl isRequired>
                  <FormLabel>Phone number</FormLabel>
                  <Input
                    type="tel"
                    autoComplete="tel"
                    value={phone}
                    onChange={(e) =>
                      setPhone(formatPhoneInput(e.target.value))
                    }
                    placeholder="(555) 123-4567"
                  />
                </FormControl>
              )}
              <Button type="submit" colorScheme="blue" isLoading={busy}>
                {mock ? "Continue" : "Send code"}
              </Button>
              <Button
                type="button"
                variant="link"
                onClick={() => {
                  setChannel(channel === "email" ? "sms" : "email");
                  setError("");
                  setOfferEmail(false);
                }}
              >
                {channel === "email"
                  ? "Use phone instead"
                  : "Use email instead"}
              </Button>
            </Stack>
          ) : (
            <Stack as="form" spacing={4} onSubmit={verifyCode}>
              <Text fontSize="sm" color="gray.600">
                {mock
                  ? `Local mock is on. Use code 000000 for ${channel === "email" ? email : phone}.`
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
                Log in
              </Button>
              <Button
                type="button"
                variant="link"
                onClick={() => {
                  setStep("identify");
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
          {offerEmail ? (
            <Button
              type="button"
              variant="link"
              onClick={() => {
                setChannel("email");
                setStep("identify");
                setCode("");
                setError("");
                setOfferEmail(false);
              }}
            >
              Text didn&apos;t work? Send a code to email instead
            </Button>
          ) : null}

          <Text fontSize="sm" color="gray.600">
            New here?{" "}
            <Link as={NextLink} href="/signup" color="blue.500">
              Sign up
            </Link>
          </Text>
        </VStack>
      </Container>
    </Box>
  );
}
