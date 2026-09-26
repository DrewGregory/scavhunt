import { Box, Code, Link, SimpleGrid, Text, VStack } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import type { ChaosSettings } from "../../lib/uploadTesting/run";
import { networkInfo } from "../../lib/uploadTesting/view";
import { NumField, SwitchField } from "./fields";

export default function ChaosPanel({ chaos, onChange }: { chaos: ChaosSettings; onChange: (c: ChaosSettings) => void }) {
  const set = (p: Partial<ChaosSettings>) => onChange({ ...chaos, ...p });
  const [net, setNet] = useState<ReturnType<typeof networkInfo>>(null);
  useEffect(() => {
    setNet(networkInfo());
    const conn = (navigator as Navigator & { connection?: EventTarget }).connection;
    const update = () => setNet({ ...networkInfo() });
    conn?.addEventListener?.("change", update);
    return () => conn?.removeEventListener?.("change", update);
  }, []);

  return (
    <VStack align="stretch" spacing={4}>
      <SimpleGrid columns={{ base: 1, sm: 2 }} spacing={3}>
        <NumField label="Fail part signs (%)" value={chaos.signFailPct} min={0} max={100} onChange={(n) => set({ signFailPct: n })} />
        <NumField
          label="Fail part uploads (%)"
          value={chaos.putFailPct}
          min={0}
          max={100}
          onChange={(n) => set({ putFailPct: n })}
          help="Aborts the PUT after 20–80% of its bytes."
        />
      </SimpleGrid>
      <SimpleGrid columns={{ base: 1, sm: 3 }} spacing={3} alignItems="end">
        <SwitchField label="Pause mid-upload" isChecked={chaos.pauseEnabled} onChange={(b) => set({ pauseEnabled: b })} />
        <NumField label="Pause at (%)" value={chaos.pauseAtPct} min={0} max={99} onChange={(n) => set({ pauseAtPct: n })} isDisabled={!chaos.pauseEnabled} />
        <NumField label="Pause for (s)" value={chaos.pauseSec} min={1} max={600} onChange={(n) => set({ pauseSec: n })} isDisabled={!chaos.pauseEnabled} />
      </SimpleGrid>
      <SimpleGrid columns={{ base: 1, sm: 3 }} spacing={3} alignItems="end">
        <SwitchField label="Simulate offline" isChecked={chaos.offlineEnabled} onChange={(b) => set({ offlineEnabled: b })} />
        <NumField label="Go offline at (%)" value={chaos.offlineAtPct} min={0} max={99} onChange={(n) => set({ offlineAtPct: n })} isDisabled={!chaos.offlineEnabled} />
        <NumField label="Offline for (s)" value={chaos.offlineSec} min={1} max={600} onChange={(n) => set({ offlineSec: n })} isDisabled={!chaos.offlineEnabled} />
      </SimpleGrid>
      {chaos.offlineEnabled && (
        <SwitchField
          label="Call retryAll() after the online event"
          isChecked={chaos.retryAllAfterOffline}
          onChange={(b) => set({ retryAllAfterOffline: b })}
        />
      )}
      <Box fontSize="sm" color="gray.600">
        <Text>
          Real bandwidth throttling isn&apos;t possible from JS. Use{" "}
          <Link href="https://developer.chrome.com/docs/devtools/network/reference#throttling" isExternal color="purple.600">
            Chrome DevTools network throttling
          </Link>{" "}
          on desktop, or the iOS <strong>Network Link Conditioner</strong> (Settings → Developer, after enabling developer mode) on
          iPhone.
        </Text>
        <Text mt={2}>
          navigator.connection:{" "}
          {net ? (
            <Code fontSize="xs">
              {[
                net.type && `type=${net.type}`,
                net.effectiveType && `effective=${net.effectiveType}`,
                net.downlink != null && `downlink=${net.downlink}Mbps`,
                net.rtt != null && `rtt=${net.rtt}ms`,
                net.saveData && "saveData",
              ]
                .filter(Boolean)
                .join(" ")}
            </Code>
          ) : (
            "not available in this browser"
          )}
        </Text>
      </Box>
    </VStack>
  );
}
