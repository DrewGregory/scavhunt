"use client";

import {
  Box,
  Button,
  Link,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  OrderedList,
  ListItem,
  Text,
  HStack,
} from "@chakra-ui/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  detectBrowserKind,
  useLocationPermission,
  type BrowserKind,
  type LocationPermissionState,
} from "./useLocationPermission";

const SNOOZE_KEY = "scavhunt.locationPromptSnoozeUntil";
const SNOOZE_MS = 24 * 60 * 60 * 1000;

type LocationPermissionUI = {
  state: LocationPermissionState;
  request: () => Promise<boolean>;
  refresh: () => Promise<void>;
  openHelp: () => void;
};

const LocationPermissionContext = createContext<LocationPermissionUI | null>(
  null,
);

function isSnoozed(): boolean {
  try {
    const raw = window.localStorage.getItem(SNOOZE_KEY);
    if (!raw) return false;
    const until = Number(raw);
    return Number.isFinite(until) && Date.now() < until;
  } catch {
    return false;
  }
}

function snoozePrompt() {
  try {
    window.localStorage.setItem(
      SNOOZE_KEY,
      String(Date.now() + SNOOZE_MS),
    );
  } catch {
    /* ignore */
  }
}

function clearSnooze() {
  try {
    window.localStorage.removeItem(SNOOZE_KEY);
  } catch {
    /* ignore */
  }
}

function deniedSteps(kind: BrowserKind): string[] {
  switch (kind) {
    case "ios":
      return [
        "Open the Settings app on your phone",
        "Tap Privacy & Security → Location Services and make sure it’s on",
        "Scroll to your browser (Safari, Chrome, etc.) and set it to While Using the App",
        "Return here and tap Try again",
      ];
    case "safari":
      return [
        "Open Safari → Settings → Websites → Location",
        "Find this site in the list and set it to Allow",
        "Return here and tap Try again",
      ];
    case "firefox":
      return [
        "Click the lock icon in the address bar",
        "Clear the blocked Location permission, or set Location to Allow",
        "Tap Try again",
      ];
    case "chromium":
      return [
        "Click the site info icon (tune or lock) left of the address bar",
        "Find Location and set it to Allow",
        "Tap Try again",
      ];
    default:
      return [
        "Open your browser’s site settings for this page",
        "Allow Location for this site",
        "Tap Try again",
      ];
  }
}

function deniedTitle(kind: BrowserKind): string {
  switch (kind) {
    case "ios":
      return "Turn on location in iOS Settings";
    case "safari":
      return "Allow location in Safari";
    case "firefox":
      return "Allow location in Firefox";
    case "chromium":
      return "Allow location in your browser";
    default:
      return "Allow location in your browser";
  }
}

export function useLocationPermissionUI(): LocationPermissionUI {
  const ctx = useContext(LocationPermissionContext);
  const fallback = useLocationPermission();
  const openHelp = useCallback(() => {
    /* no-op without provider */
  }, []);
  if (ctx) return ctx;
  return {
    state: fallback.state,
    request: fallback.request,
    refresh: fallback.refresh,
    openHelp,
  };
}

/**
 * Provides permission state + a modal for explain-first / denied recovery.
 * Mount once for signed-in team members (e.g. in NavContainer).
 */
export function LocationPermissionProvider({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  const { state, request, refresh } = useLocationPermission();
  const [isOpen, setIsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [browserKind, setBrowserKind] = useState<BrowserKind>("other");

  useEffect(() => {
    setBrowserKind(detectBrowserKind());
  }, []);

  // Auto-open explain-first when we can still prompt and user hasn't snoozed.
  useEffect(() => {
    if (!active) return;
    if (state === "prompt" && !isSnoozed()) {
      setIsOpen(true);
    }
    if (state === "granted") {
      clearSnooze();
      setIsOpen(false);
    }
  }, [active, state]);

  const openHelp = useCallback(() => {
    if (state === "granted") return;
    setIsOpen(true);
  }, [state]);

  const onClose = useCallback(() => {
    setIsOpen(false);
    if (state === "prompt") snoozePrompt();
  }, [state]);

  const onEnable = useCallback(async () => {
    setBusy(true);
    try {
      const ok = await request();
      if (ok) {
        clearSnooze();
        setIsOpen(false);
      }
      // If denied, stay open so the modal switches to recovery steps.
    } finally {
      setBusy(false);
    }
  }, [request]);

  const onTryAgain = useCallback(async () => {
    setBusy(true);
    try {
      await refresh();
      // Firefox / iOS denials can be temporary — requesting again may re-prompt.
      const ok = await request();
      if (ok) {
        clearSnooze();
        setIsOpen(false);
      }
    } finally {
      setBusy(false);
    }
  }, [refresh, request]);

  const value = useMemo<LocationPermissionUI>(
    () => ({ state, request, refresh, openHelp }),
    [state, request, refresh, openHelp],
  );

  const showDenied = state === "denied";
  const showUnsupported = state === "unsupported";
  // Explain-first only while we can still prompt (not after grant).
  const showExplain = state === "prompt" || state === "unknown";
  const modalOpen = active && isOpen && state !== "granted";

  return (
    <LocationPermissionContext.Provider value={value}>
      {children}

      {active && state === "denied" && !isOpen ? (
        <Box
          position="fixed"
          bottom={{ base: 4, md: 6 }}
          left="50%"
          transform="translateX(-50%)"
          zIndex={1400}
          bg="gray.800"
          color="white"
          px={4}
          py={2}
          borderRadius="md"
          boxShadow="lg"
          maxW="calc(100vw - 2rem)"
        >
          <Text fontSize="sm">
            Location is blocked.{" "}
            <Link
              as="button"
              textDecoration="underline"
              fontWeight="semibold"
              onClick={openHelp}
            >
              How to fix
            </Link>
          </Text>
        </Box>
      ) : null}

      <Modal isOpen={modalOpen} onClose={onClose} isCentered>
        <ModalOverlay />
        <ModalContent mx={4}>
          {showExplain ? (
            <>
              <ModalHeader>Share your location</ModalHeader>
              <ModalCloseButton />
              <ModalBody>
                <Text>
                  We use your location to show your team on the map and verify
                  deposits. Your browser will ask next — choose Allow.
                </Text>
              </ModalBody>
              <ModalFooter>
                <HStack spacing={3}>
                  <Button variant="ghost" onClick={onClose} isDisabled={busy}>
                    Not now
                  </Button>
                  <Button
                    colorScheme="blue"
                    onClick={() => void onEnable()}
                    isLoading={busy}
                  >
                    Enable location
                  </Button>
                </HStack>
              </ModalFooter>
            </>
          ) : showUnsupported ? (
            <>
              <ModalHeader>Location not available</ModalHeader>
              <ModalCloseButton />
              <ModalBody>
                <Text>
                  This browser can’t share your location, so map tracking and
                  deposits won’t work here. Try another browser or device.
                </Text>
              </ModalBody>
              <ModalFooter>
                <Button onClick={onClose}>Got it</Button>
              </ModalFooter>
            </>
          ) : (
            <>
              <ModalHeader>{deniedTitle(browserKind)}</ModalHeader>
              <ModalCloseButton />
              <ModalBody>
                <Text mb={3}>
                  Location is blocked for this site. Follow these steps, then
                  try again:
                </Text>
                <OrderedList spacing={2}>
                  {deniedSteps(browserKind).map((step) => (
                    <ListItem key={step}>{step}</ListItem>
                  ))}
                </OrderedList>
              </ModalBody>
              <ModalFooter>
                <HStack spacing={3}>
                  <Button variant="ghost" onClick={onClose} isDisabled={busy}>
                    Close
                  </Button>
                  <Button
                    colorScheme="blue"
                    onClick={() => void onTryAgain()}
                    isLoading={busy}
                  >
                    Try again
                  </Button>
                </HStack>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </LocationPermissionContext.Provider>
  );
}
