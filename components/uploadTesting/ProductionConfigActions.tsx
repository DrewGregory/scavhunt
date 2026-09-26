import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  Button,
  HStack,
  Text,
  useToast,
} from "@chakra-ui/react";
import { useRef, useState } from "react";
import type { UploadConfig } from "../../lib/upload/config";
import { describeConfig } from "../../lib/uploadTesting/presets";

type Action = "apply" | "reset";

export default function ProductionConfigActions({
  config,
  hasOverrides,
  onSaved,
}: {
  config: UploadConfig;
  hasOverrides: boolean | null;
  onSaved: () => void;
}) {
  const [pending, setPending] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const toast = useToast();

  const run = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/upload-config", {
        method: pending === "apply" ? "PUT" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: pending === "apply" ? JSON.stringify({ config }) : undefined,
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`);
      toast({ status: "success", title: pending === "apply" ? "Production upload config saved" : "Production reset to code defaults" });
      onSaved();
      setPending(null);
    } catch (e) {
      toast({ status: "error", title: "Failed", description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <HStack flexWrap="wrap" gap={2}>
        <Button size="sm" colorScheme="red" variant="outline" onClick={() => setPending("apply")}>
          Apply as production default
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setPending("reset")} isDisabled={hasOverrides === false}>
          Reset production to code defaults
        </Button>
        {hasOverrides != null && (
          <Text fontSize="xs" color="gray.500">
            Production currently uses {hasOverrides ? "saved overrides" : "code defaults"}.
          </Text>
        )}
      </HStack>
      <AlertDialog isOpen={pending != null} leastDestructiveRef={cancelRef} onClose={() => setPending(null)}>
        <AlertDialogOverlay>
          <AlertDialogContent mx={4}>
            <AlertDialogHeader>{pending === "apply" ? "Apply to production?" : "Reset production config?"}</AlertDialogHeader>
            <AlertDialogBody fontSize="sm">
              {pending === "apply" ? (
                <>
                  Every player upload will use this config from their next page load:
                  <br />
                  <strong>{describeConfig(config)}</strong>
                </>
              ) : (
                "Removes the saved override; players go back to the defaults in lib/upload/config.ts."
              )}
            </AlertDialogBody>
            <AlertDialogFooter>
              <Button ref={cancelRef} size="sm" onClick={() => setPending(null)}>
                Cancel
              </Button>
              <Button size="sm" colorScheme="red" ml={3} onClick={run} isLoading={busy}>
                {pending === "apply" ? "Apply" : "Reset"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </>
  );
}
