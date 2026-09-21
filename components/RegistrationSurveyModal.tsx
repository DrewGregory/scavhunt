"use client";

import {
  Button,
  FormControl,
  FormLabel,
  Heading,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  Radio,
  RadioGroup,
  Stack,
  Text,
  Textarea,
  useToast,
} from "@chakra-ui/react";
import { useEffect, useState } from "react";

export type SurveyIntent = "playing" | "browsing";

export function RegistrationSurveyModal({
  isOpen,
  onClose,
  required = false,
  onCompleted,
}: {
  isOpen: boolean;
  onClose: () => void;
  /** When true (e.g. blocked from voting), hide “Not now”. */
  required?: boolean;
  onCompleted?: () => void;
}) {
  const toast = useToast();
  const [intent, setIntent] = useState<SurveyIntent>("playing");
  const [teamPreferences, setTeamPreferences] = useState("");
  const [competitiveness, setCompetitiveness] = useState("");
  const [timeCommitment, setTimeCommitment] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setError("");
    setLoaded(false);
    (async () => {
      try {
        const res = await fetch("/api/me/survey");
        if (res.ok) {
          const data = await res.json();
          if (data.intent === "playing" || data.intent === "browsing") {
            setIntent(data.intent);
          }
          setTeamPreferences(data.teamPreferences || "");
          setCompetitiveness(data.competitiveness || "");
          setTimeCommitment(data.timeCommitment || "");
        }
      } finally {
        setLoaded(true);
      }
    })();
  }, [isOpen]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/me/survey", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intent,
          teamPreferences,
          competitiveness,
          timeCommitment,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not save survey");
        return;
      }
      toast({ title: "Survey saved", status: "success", duration: 2000 });
      onCompleted?.();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={required ? () => undefined : onClose}
      isCentered
      size="md"
      closeOnOverlayClick={!required}
      closeOnEsc={!required}
    >
      <ModalOverlay bg="blackAlpha.700" backdropFilter="blur(4px)" />
      <ModalContent bg="white" color="gray.800" mx={4}>
        <ModalHeader>
          <Heading size="md" color="gray.900">
            Player survey
          </Heading>
        </ModalHeader>
        {!required ? <ModalCloseButton /> : null}
        <ModalBody pb={6}>
          <Stack as="form" spacing={4} onSubmit={submit}>
            <Text fontSize="sm" color="gray.600">
              {required
                ? "Fill this out before you can vote in the tournament."
                : "Help us form teams. You can edit this anytime from the header."}
            </Text>

            <FormControl isRequired isDisabled={!loaded}>
              <FormLabel color="gray.700">
                Are you planning on playing this year, or just checking out the
                site for funsies?
              </FormLabel>
              <RadioGroup
                value={intent}
                onChange={(v) => setIntent(v as SurveyIntent)}
              >
                <Stack>
                  <Radio value="playing">Planning to play</Radio>
                  <Radio value="browsing">Just browsing for funsies</Radio>
                </Stack>
              </RadioGroup>
            </FormControl>

            {intent === "playing" ? (
              <>
                <FormControl isRequired isDisabled={!loaded}>
                  <FormLabel color="gray.700">
                    Who do you want to play with? (team preferences)
                  </FormLabel>
                  <Textarea
                    value={teamPreferences}
                    onChange={(e) => setTeamPreferences(e.target.value)}
                    placeholder="Friends, roommates, coworkers…"
                    bg="white"
                    borderColor="gray.300"
                    rows={3}
                  />
                </FormControl>
                <FormControl isRequired isDisabled={!loaded}>
                  <FormLabel color="gray.700">
                    How competitive do you want to be? (1–5)
                  </FormLabel>
                  <Textarea
                    value={competitiveness}
                    onChange={(e) => setCompetitiveness(e.target.value)}
                    placeholder="e.g. 3 — fun but trying to win a few challenges"
                    bg="white"
                    borderColor="gray.300"
                    rows={2}
                  />
                </FormControl>
                <FormControl isRequired isDisabled={!loaded}>
                  <FormLabel color="gray.700">
                    Can you commit to the full day? Let us know about your time
                    constraints here.
                  </FormLabel>
                  <Text fontSize="xs" color="gray.500" mb={2}>
                    Please come for the full day if you can. It&apos;s the most
                    fun that way!
                  </Text>
                  <Textarea
                    value={timeCommitment}
                    onChange={(e) => setTimeCommitment(e.target.value)}
                    placeholder="I’m in for the whole day!"
                    bg="white"
                    borderColor="gray.300"
                    rows={2}
                  />
                </FormControl>
              </>
            ) : null}

            {error ? (
              <Text color="red.500" fontSize="sm">
                {error}
              </Text>
            ) : null}

            <Button type="submit" colorScheme="yellow" isLoading={busy}>
              Save
            </Button>
            {!required ? (
              <Button type="button" variant="ghost" onClick={onClose}>
                Not now
              </Button>
            ) : null}
          </Stack>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
