"use client";

import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Heading,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  Stack,
  Text,
  useToast,
} from "@chakra-ui/react";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { isBirdMockClient } from "../lib/bird";
import { formatPhoneInput } from "../lib/phone";

type Mode = "login" | "signup";
type Channel = "sms" | "email";
type Step = "identify" | "code";

export function AuthModal({
  isOpen,
  onClose,
  initialMode = "login",
  onSignupSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: Mode;
  /** Fired after a successful signup (before navigation refresh). */
  onSignupSuccess?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const mock = isBirdMockClient();

  const [mode, setMode] = useState<Mode>(initialMode);
  const [channel, setChannel] = useState<Channel>("sms");
  const [step, setStep] = useState<Step>("identify");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [offerEmail, setOfferEmail] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setStep("identify");
      setCode("");
      setError("");
      setOfferEmail(false);
      setChannel("sms");
    }
  }, [isOpen, initialMode]);

  function resetTo(next: Mode) {
    setMode(next);
    setStep("identify");
    setCode("");
    setError("");
    setOfferEmail(false);
    setChannel("sms");
  }

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    // Signup always texts first; email fallback is only on the code step.
    const sendChannel: Channel =
      mode === "signup" ? "sms" : channel;
    try {
      const url =
        mode === "signup" ? "/api/auth/signup/start" : "/api/auth/send";
      const body =
        mode === "signup"
          ? { name, email, phone, channel: sendChannel }
          : sendChannel === "email"
            ? { channel: "email", email }
            : { channel: "sms", phone };
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not send code");
        if (sendChannel === "sms" && data.emailFallback) setOfferEmail(true);
        return;
      }
      setChannel(sendChannel);
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
      const url =
        mode === "signup" ? "/api/auth/signup/verify" : "/api/auth/verify";
      const body =
        mode === "signup"
          ? { name, email, phone, channel, code }
          : channel === "email"
            ? { channel: "email", email, code }
            : { channel: "sms", phone, code };
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not verify code");
        return;
      }
      toast({
        title: mode === "signup" ? "Welcome!" : "Logged in",
        status: "success",
        duration: 2000,
      });
      const wasSignup = mode === "signup";
      onClose();
      if (wasSignup) onSignupSuccess?.();
      await router.replace(router.asPath);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered size="md">
      <ModalOverlay bg="blackAlpha.700" backdropFilter="blur(4px)" />
      <ModalContent bg="white" color="gray.800" mx={4}>
        <ModalHeader>
          <Heading size="md" color="gray.900">
            {mode === "signup" ? "Sign up" : "Log in"}
          </Heading>
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody pb={6}>
          <Stack spacing={4}>
            <Text fontSize="sm" color="gray.600">
              {mode === "signup"
                ? "Create an account to join the scavenger hunt."
                : "Log in to continue the hunt."}
            </Text>

            {step === "identify" ? (
              <Stack as="form" spacing={3} onSubmit={sendCode}>
                {mode === "signup" ? (
                  <FormControl isRequired>
                    <FormLabel color="gray.700">Name</FormLabel>
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Your name"
                      bg="white"
                      borderColor="gray.300"
                    />
                  </FormControl>
                ) : null}
                {(mode === "signup" || channel === "email") && (
                  <FormControl
                    isRequired={mode === "signup" || channel === "email"}
                  >
                    <FormLabel color="gray.700">Email</FormLabel>
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@email.com"
                      bg="white"
                      borderColor="gray.300"
                    />
                  </FormControl>
                )}
                {(mode === "signup" || channel === "sms") && (
                  <FormControl
                    isRequired={mode === "signup" || channel === "sms"}
                  >
                    <FormLabel color="gray.700">Phone</FormLabel>
                    <Input
                      type="tel"
                      value={phone}
                      onChange={(e) =>
                        setPhone(formatPhoneInput(e.target.value))
                      }
                      placeholder="(415) 555-2671"
                      bg="white"
                      borderColor="gray.300"
                    />
                  </FormControl>
                )}
                <Button type="submit" colorScheme="yellow" isLoading={busy}>
                  {mock ? "Continue" : "Send code"}
                </Button>
                {/* Login only: pick email up front. Signup always texts first. */}
                {mode === "login" ? (
                  <Button
                    type="button"
                    variant="link"
                    colorScheme="yellow"
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
                ) : null}
              </Stack>
            ) : (
              <Stack as="form" spacing={3} onSubmit={verifyCode}>
                <Text fontSize="sm" color="gray.600">
                  {mock
                    ? "Mock mode is on. Use code 000000."
                    : channel === "email"
                      ? `Code sent to ${email}`
                      : `Code sent to ${phone}`}
                </Text>
                <FormControl isRequired>
                  <FormLabel color="gray.700">Verification code</FormLabel>
                  <Input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="6-digit code"
                    bg="white"
                    borderColor="gray.300"
                  />
                </FormControl>
                <Button type="submit" colorScheme="yellow" isLoading={busy}>
                  {mode === "signup" ? "Create account" : "Log in"}
                </Button>
                {channel === "sms" ? (
                  <Button
                    type="button"
                    variant="link"
                    colorScheme="yellow"
                    isDisabled={busy}
                    onClick={async () => {
                      setChannel("email");
                      setCode("");
                      setError("");
                      setOfferEmail(false);
                      if (mode === "signup" && email.trim()) {
                        setBusy(true);
                        try {
                          const res = await fetch("/api/auth/signup/start", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              name,
                              email,
                              phone,
                              channel: "email",
                            }),
                          });
                          const data = await res.json().catch(() => ({}));
                          if (!res.ok) {
                            setError(data.error || "Could not send email code");
                            setStep("identify");
                            return;
                          }
                        } finally {
                          setBusy(false);
                        }
                      } else {
                        setStep("identify");
                      }
                    }}
                  >
                    Didn&apos;t get a text? Use email instead
                  </Button>
                ) : null}
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
            {offerEmail && step === "identify" ? (
              <Button
                type="button"
                variant="link"
                colorScheme="yellow"
                onClick={() => {
                  setChannel("email");
                  setCode("");
                  setError("");
                  setOfferEmail(false);
                }}
              >
                Text failed — try email instead
              </Button>
            ) : null}

            <Box pt={2} borderTopWidth="1px" borderColor="gray.200">
              {mode === "login" ? (
                <Text fontSize="sm" color="gray.600">
                  New here?{" "}
                  <Button
                    variant="link"
                    colorScheme="yellow"
                    onClick={() => resetTo("signup")}
                  >
                    Sign up
                  </Button>
                </Text>
              ) : (
                <Text fontSize="sm" color="gray.600">
                  Already have an account?{" "}
                  <Button
                    variant="link"
                    colorScheme="yellow"
                    onClick={() => resetTo("login")}
                  >
                    Log in
                  </Button>
                </Text>
              )}
            </Box>
          </Stack>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
