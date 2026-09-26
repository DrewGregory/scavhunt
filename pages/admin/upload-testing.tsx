import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Alert,
  AlertDescription,
  AlertIcon,
  AlertTitle,
  Badge,
  Box,
  Button,
  Checkbox,
  Code,
  Heading,
  HStack,
  Input,
  Link as ExtLink,
  Progress,
  Stack,
  Text,
  useToast,
  VStack,
  Wrap,
  WrapItem,
} from "@chakra-ui/react";
import type { GetServerSidePropsContext, InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import useSWR from "swr";
import NavContainer from "../../components/NavContainer";
import ConfigPanel from "../../components/uploadTesting/ConfigPanel";
import ChaosPanel from "../../components/uploadTesting/ChaosPanel";
import UploadMetrics from "../../components/uploadTesting/UploadMetrics";
import CompressionResults from "../../components/uploadTesting/CompressionResults";
import DownloadBench from "../../components/uploadTesting/DownloadBench";
import ComparePlayers, { type PlayerSide } from "../../components/uploadTesting/ComparePlayers";
import CompareTable, { type CompareColumn } from "../../components/uploadTesting/CompareTable";
import RunHistory from "../../components/uploadTesting/RunHistory";
import ProductionConfigActions from "../../components/uploadTesting/ProductionConfigActions";
import PartWaterfall from "../../components/uploadTesting/PartWaterfall";
import { publicUser, requireAdminSSP } from "../../lib/auth";
import { PRODUCTION_UPLOAD_CONFIG, type UploadConfig } from "../../lib/upload/config";
import type { PartEvent } from "../../lib/upload/uppyConfig";
import { buildWaterfall } from "../../lib/uploadTesting/metrics";
import { detectCodecSupport, type CodecSupport } from "../../lib/uploadTesting/codecs";
import { PRESETS, describeConfig, presetIdFor } from "../../lib/uploadTesting/presets";
import {
  NO_CHAOS,
  revokeOutcomeUrls,
  runFullTest,
  type ChaosSettings,
  type TestOutcome,
} from "../../lib/uploadTesting/run";
import { savedPayload, viewFromOutcome, viewFromSaved, type TestView } from "../../lib/uploadTesting/view";
import type { SerializedUploadTestRun } from "../../lib/uploadTesting/storage";
import { fmtBytes, fmtMbps, fmtMs, fmtPct, savedPct } from "../../lib/uploadTesting/format";
import * as dbg from "../../lib/uploadTesting/debug";

export const getServerSideProps = async (context: GetServerSidePropsContext) => {
  const auth = await requireAdminSSP(context);
  if (auth.redirect) return { redirect: auth.redirect };
  return { props: { user: publicUser(auth.user!) } };
};

async function jsonFetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

type Variant = { id: string; label: string; config: UploadConfig };
const VARIANTS_KEY = "uploadTesting.variants";

function configLabel(c: UploadConfig): string {
  const id = presetIdFor(c);
  return PRESETS.find((p) => p.id === id)?.label ?? describeConfig(c);
}

function Section({ title, children, badge }: { title: string; children: ReactNode; badge?: ReactNode }) {
  return (
    <AccordionItem>
      <AccordionButton px={2}>
        <HStack flex="1" textAlign="left">
          <Heading size="sm">{title}</Heading>
          {badge}
        </HStack>
        <AccordionIcon />
      </AccordionButton>
      <AccordionPanel px={2} pb={4}>
        {children}
      </AccordionPanel>
    </AccordionItem>
  );
}

function statBlock(v: TestView, side: "original" | "compressed"): ReactNode {
  const c = v.compress;
  if (!c) return <Text>{fmtBytes(v.fileSize)}</Text>;
  const m = side === "original" ? c.input : c.output;
  const up = v.uploads[side];
  const dl = v.downloads[side];
  return (
    <VStack align="start" spacing={0}>
      <Text>
        {m.width && m.height ? `${m.width}×${m.height}` : "?"} {m.codec ?? ""} {m.fps ? `${m.fps.toFixed(0)}fps` : ""} {fmtMbps(m.bitrate)}
      </Text>
      <Text>
        {fmtBytes(m.sizeBytes)}
        {side === "compressed" && c.compressed ? ` (−${fmtPct(savedPct(c.input.sizeBytes, c.output.sizeBytes))})` : ""}
        {m.durationSec ? ` · ${m.durationSec.toFixed(1)}s` : ""}
      </Text>
      {up && <Text>upload {fmtMs(up.summary.totalMs)} · {up.summary.parts} parts</Text>}
      {dl?.firstFrameCdn && <Text>first frame (CDN) {fmtMs(dl.firstFrameCdn.playingMs)}</Text>}
    </VStack>
  );
}

function RunStatusBanner({
  running,
  phase,
  view,
}: {
  running: boolean;
  phase: string;
  view: TestView | null;
}) {
  if (running) {
    return (
      <Alert status="info" borderRadius="md">
        <AlertIcon />
        <Box>
          <AlertTitle fontSize="sm">Run in progress</AlertTitle>
          <AlertDescription fontSize="sm">
            {phase || "Starting…"} — progress bars below are byte upload only. Success is decided after Spaces
            multipart <Code fontSize="xs">complete</Code> returns (there is no overall run timeout; part signed URLs
            expire after 15 minutes).
          </AlertDescription>
        </Box>
      </Alert>
    );
  }
  if (!view) return null;
  const up = view.uploads.compressed;
  if (!up) {
    return (
      <Alert status="warning" borderRadius="md">
        <AlertIcon />
        <Box>
          <AlertTitle fontSize="sm">No upload result yet</AlertTitle>
          <AlertDescription fontSize="sm">
            Compression/preview may have updated, but multipart upload never recorded a result. Check the console for{" "}
            <Code fontSize="xs">upload-testing</Code>.
          </AlertDescription>
        </Box>
      </Alert>
    );
  }
  if (up.ok) {
    return (
      <Alert status="success" borderRadius="md">
        <AlertIcon />
        <Box>
          <AlertTitle fontSize="sm">Upload succeeded</AlertTitle>
          <AlertDescription fontSize="sm">
            Multipart complete finished. Key: <Code fontSize="xs">{up.key ?? "—"}</Code>
            {up.cdnUrl && (
              <>
                {" · "}
                <ExtLink href={up.cdnUrl} isExternal color="green.700">
                  open CDN URL
                </ExtLink>
              </>
            )}
          </AlertDescription>
        </Box>
      </Alert>
    );
  }
  return (
    <Alert status="error" borderRadius="md">
      <AlertIcon />
      <Box>
        <AlertTitle fontSize="sm">Upload failed</AlertTitle>
        <AlertDescription fontSize="sm">
          {up.error || "Upload did not complete."}
          {up.key ? (
            <>
              {" "}
              Partial key was <Code fontSize="xs">{up.key}</Code> — incomplete multipart may still exist in Spaces until
              aborted/expired.
            </>
          ) : null}{" "}
          Note: the bar can hit 100% (all part bytes sent) and still fail on the final <Code fontSize="xs">complete</Code>{" "}
          call.
        </AlertDescription>
      </Box>
    </Alert>
  );
}

export default function UploadTestingPage(_props: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [config, setConfig] = useState<UploadConfig>(PRODUCTION_UPLOAD_CONFIG);
  const [chaos, setChaos] = useState<ChaosSettings>(NO_CHAOS);
  const [uploadOriginal, setUploadOriginal] = useState(false);
  const [runDownloads, setRunDownloads] = useState(true);
  const [autoSave, setAutoSave] = useState(true);
  const [codecSupport, setCodecSupport] = useState<CodecSupport | null>(null);
  const [loadingProd, setLoadingProd] = useState(false);

  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<string>("");
  const [compressProgress, setCompressProgress] = useState(0);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [skipFn, setSkipFn] = useState<(() => void) | null>(null);
  const [liveEvents, setLiveEvents] = useState<PartEvent[]>([]);
  const liveRef = useRef<PartEvent[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const outcomesRef = useRef<TestOutcome[]>([]);

  const [view, setView] = useState<TestView | null>(null);
  const [compareCols, setCompareCols] = useState<CompareColumn[]>([]);
  const [comparePick, setComparePick] = useState<number[]>([0, 1]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [compareSel, setCompareSel] = useState<string[]>(["current", "480p"]);
  const [variantName, setVariantName] = useState("");
  // Accordion indexes: 0 Settings, 1 Chaos, 2 Preview, 3 Compression, 4 Upload, 5 Downloads, 6 Compare, 7 History
  const [openSections, setOpenSections] = useState<number[]>([0, 2]);

  const revealResults = useCallback(() => {
    setOpenSections((prev) => Array.from(new Set([...prev, 2, 3, 4, 5, 7])));
  }, []);

  const history = useSWR<{ runs: SerializedUploadTestRun[] }>("/api/admin/upload-tests", jsonFetcher);
  const prod = useSWR<{ overrides: unknown; config: UploadConfig }>("/api/admin/upload-config", jsonFetcher);

  useEffect(() => {
    dbg.info("Upload testing page mounted — filter console by upload-testing");
    detectCodecSupport().then(setCodecSupport).catch(() => setCodecSupport(null));
    try {
      const saved = JSON.parse(localStorage.getItem(VARIANTS_KEY) ?? "[]");
      if (Array.isArray(saved)) setVariants(saved);
    } catch {
      // ignore
    }
    const outcomes = outcomesRef.current;
    return () => {
      abortRef.current?.abort();
      outcomes.forEach(revokeOutcomeUrls);
    };
  }, []);

  useEffect(() => {
    if (!file) return setFileUrl(null);
    const url = URL.createObjectURL(file);
    setFileUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setLiveEvents([...liveRef.current]), 500);
    return () => clearInterval(id);
  }, [running]);

  const persistVariants = (next: Variant[]) => {
    setVariants(next);
    localStorage.setItem(VARIANTS_KEY, JSON.stringify(next));
  };

  const loadProduction = async () => {
    setLoadingProd(true);
    try {
      const data = await jsonFetcher<{ config: UploadConfig }>("/api/upload-config");
      setConfig(data.config);
      toast({ status: "info", title: "Loaded production config", duration: 2000 });
    } catch (e) {
      toast({ status: "error", title: "Could not load config", description: String(e) });
    } finally {
      setLoadingProd(false);
    }
  };

  const saveRun = useCallback(
    async (v: TestView, label: string) => {
      const res = await fetch("/api/admin/upload-tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(savedPayload(v, label)),
      });
      if (!res.ok) {
        toast({ status: "warning", title: "Run not saved", description: `HTTP ${res.status}` });
      }
      void history.mutate();
    },
    [history, toast],
  );

  const execute = async (cfg: UploadConfig, label: string): Promise<TestView | null> => {
    if (!file) return null;
    liveRef.current = [];
    setLiveEvents([]);
    setCompressProgress(0);
    setUploadProgress({});
    revealResults();
    const outcome = await runFullTest({
      file,
      config: cfg,
      chaos,
      uploadOriginal,
      runDownloads,
      signal: abortRef.current?.signal,
      onPhase: setPhase,
      onCompressProgress: setCompressProgress,
      onUploadProgress: (l, f) => setUploadProgress((p) => ({ ...p, [l]: f })),
      onSkipAvailable: (fn) => setSkipFn(() => fn),
      onPartEvent: (_l, e) => liveRef.current.push(e),
      onSnapshot: (o) => {
        const v = viewFromOutcome(o);
        dbg.setLastView(v);
        setView(v);
      },
    });
    outcomesRef.current.push(outcome);
    const v = viewFromOutcome(outcome);
    dbg.setLastView(v);
    dbg.setLastOutcome(outcome);
    setView(v);
    if (autoSave) await saveRun(v, label);
    return v;
  };

  const runSingle = async () => {
    abortRef.current = new AbortController();
    setRunning(true);
    setPhase("Starting…");
    try {
      const v = await execute(config, configLabel(config));
      if (v) {
        setView(v);
        revealResults();
        const up = v.uploads.compressed;
        if (up?.ok) {
          toast({
            status: "success",
            title: "Upload succeeded",
            description: up.cdnUrl ? "CDN URL ready — see the green banner." : `Key: ${up.key}`,
            duration: 8000,
          });
        } else {
          toast({
            status: "error",
            title: "Upload failed",
            description: up?.error ?? "See the red banner and console logs.",
            duration: 10000,
          });
        }
      }
    } catch (e) {
      dbg.error("runSingle failed", e);
      dbg.setLastError(e);
      toast({ status: "error", title: "Run failed", description: e instanceof Error ? e.message : String(e) });
    } finally {
      setRunning(false);
      setSkipFn(null);
    }
  };

  const compareOptions: Variant[] = useMemo(
    () => [
      { id: "current", label: `Current (${describeConfig(config)})`, config },
      ...PRESETS.map((p) => ({ id: p.id, label: p.label, config: p.config })),
      ...variants,
    ],
    [config, variants],
  );

  const runCompare = async () => {
    const picked = compareOptions.filter((o) => compareSel.includes(o.id)).slice(0, 4);
    if (picked.length < 2) return;
    abortRef.current = new AbortController();
    setRunning(true);
    setCompareCols([]);
    try {
      const cols: CompareColumn[] = [];
      for (const [i, opt] of picked.entries()) {
        if (abortRef.current.signal.aborted) break;
        setPhase(`Config ${i + 1}/${picked.length}: ${opt.label}`);
        const v = await execute(opt.config, opt.label);
        if (v) {
          cols.push({ label: opt.label, view: v });
          setCompareCols([...cols]);
        }
      }
      setComparePick([0, Math.min(1, cols.length - 1)]);
      if (cols[0]) {
        setView(cols[0].view);
        setOpenSections((prev) => Array.from(new Set([...prev, 2, 3, 4, 5, 6, 7])));
      }
    } finally {
      setRunning(false);
      setSkipFn(null);
    }
  };

  const loadHistory = (run: SerializedUploadTestRun) => {
    const v = viewFromSaved(run);
    if (!v) {
      toast({ status: "warning", title: "Unrecognized saved run format" });
      return;
    }
    setView(v);
    setConfig(v.config);
    if (v.chaos) setChaos(v.chaos);
    revealResults();
  };

  const deleteHistory = async (run: SerializedUploadTestRun) => {
    if (!window.confirm("Delete this run from history?")) return;
    const res = await fetch(`/api/admin/upload-tests/${run.id}`, { method: "DELETE" });
    if (!res.ok) toast({ status: "error", title: "Delete failed" });
    void history.mutate();
  };

  const isImage = (view?.fileType ?? file?.type ?? "").startsWith("image/");
  const playersA: PlayerSide = view
    ? { title: "Original", src: view.media.original, stats: statBlock(view, "original") }
    : { title: "Original (local)", src: fileUrl, stats: file ? <Text>{fmtBytes(file.size)} {file.type}</Text> : null };
  const playersB: PlayerSide = view
    ? { title: "Compressed", src: view.media.compressed, poster: view.media.poster, stats: statBlock(view, "compressed") }
    : { title: "Compressed", src: null };

  const liveWaterfall = useMemo(() => buildWaterfall(liveEvents), [liveEvents]);
  const pickA = compareCols[comparePick[0]];
  const pickB = compareCols[comparePick[1]];

  return (
    <NavContainer title="Upload testing">
      <VStack align="stretch" spacing={4} width="100%" maxW="1100px">
        <HStack justify="space-between" flexWrap="wrap" gap={2}>
          <Heading size="lg">Upload testing</Heading>
          <Button as={Link} href="/admin" size="sm" variant="outline">
            ← Admin
          </Button>
        </HStack>
        <Text fontSize="sm" color="gray.600">
          Sandbox uploads go to <code>sandbox/&lt;you&gt;/&lt;run&gt;/</code> and never create submissions. Open DevTools
          console and filter <code>upload-testing</code> — every compress/part/lifecycle/download step is logged. After a
          run: <code>window.__uploadTesting.lastOutcome</code> (key + cdnUrl) and{" "}
          <code>window.__uploadTesting.events</code>. Upload section also shows the Spaces key + CDN link + Verify HEAD.
        </Text>

        <Box borderWidth="1px" borderRadius="md" p={3}>
          <Stack direction={{ base: "column", sm: "row" }} spacing={3} align={{ sm: "center" }}>
            <Button as="label" size="sm" cursor="pointer">
              Choose file
              <Input type="file" accept="video/*,image/*" display="none" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </Button>
            <Button as="label" size="sm" cursor="pointer">
              Record
              <Input
                type="file"
                accept="video/*,image/*"
                // eslint-disable-next-line react/no-unknown-property
                capture="environment"
                display="none"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </Button>
            <Text fontSize="sm" noOfLines={1}>
              {file ? `${file.name} · ${fmtBytes(file.size)} · ${file.type || "unknown type"}` : "No file selected"}
            </Text>
          </Stack>
          <Wrap mt={3} spacing={4}>
            <WrapItem>
              <Checkbox size="sm" isChecked={uploadOriginal} onChange={(e) => setUploadOriginal(e.target.checked)}>
                Also upload original
              </Checkbox>
            </WrapItem>
            <WrapItem>
              <Checkbox size="sm" isChecked={runDownloads} onChange={(e) => setRunDownloads(e.target.checked)}>
                Download benchmarks
              </Checkbox>
            </WrapItem>
            <WrapItem>
              <Checkbox size="sm" isChecked={autoSave} onChange={(e) => setAutoSave(e.target.checked)}>
                Save to history
              </Checkbox>
            </WrapItem>
          </Wrap>
          <HStack mt={3} flexWrap="wrap" gap={2}>
            <Button colorScheme="purple" size="sm" onClick={runSingle} isDisabled={!file || running}>
              Run
            </Button>
            {running && (
              <Button size="sm" variant="outline" onClick={() => abortRef.current?.abort()}>
                Cancel
              </Button>
            )}
            {skipFn && (
              <Button size="sm" variant="outline" onClick={() => skipFn()}>
                Skip compression
              </Button>
            )}
            <Text fontSize="sm" color="gray.600">
              {configLabel(config)}
            </Text>
          </HStack>
          {running && (
            <VStack align="stretch" mt={3} spacing={2}>
              <Text fontSize="sm">{phase}</Text>
              <Box>
                <Text fontSize="xs">Compress {Math.round(compressProgress * 100)}%</Text>
                <Progress size="sm" value={compressProgress * 100} colorScheme="purple" />
              </Box>
              {Object.entries(uploadProgress).map(([l, f]) => (
                <Box key={l}>
                  <Text fontSize="xs">
                    Upload {l} {Math.round(f * 100)}% (bytes only — not final success)
                  </Text>
                  <Progress size="sm" value={f * 100} colorScheme="teal" />
                </Box>
              ))}
              {liveWaterfall.rows.length > 0 && <PartWaterfall waterfall={liveWaterfall} />}
            </VStack>
          )}
          <Box mt={3}>
            <RunStatusBanner running={running} phase={phase} view={view} />
          </Box>
        </Box>

        <Accordion allowMultiple index={openSections} onChange={(idx) => setOpenSections(Array.isArray(idx) ? idx : [idx])}>
          <Section title="Settings" badge={<Badge>{presetIdFor(config) ?? "custom"}</Badge>}>
            <VStack align="stretch" spacing={4}>
              <ConfigPanel
                config={config}
                onChange={setConfig}
                codecSupport={codecSupport}
                onLoadProduction={loadProduction}
                loadingProduction={loadingProd}
              />
              <ProductionConfigActions
                config={config}
                hasOverrides={prod.data ? prod.data.overrides != null : null}
                onSaved={() => void prod.mutate()}
              />
            </VStack>
          </Section>

          <Section
            title="Chaos"
            badge={
              chaos.signFailPct || chaos.putFailPct || chaos.pauseEnabled || chaos.offlineEnabled ? (
                <Badge colorScheme="orange">on</Badge>
              ) : undefined
            }
          >
            <ChaosPanel chaos={chaos} onChange={setChaos} />
          </Section>

          <Section title="Preview" badge={view ? <Badge>{view.source}</Badge> : undefined}>
            <ComparePlayers a={playersA} b={playersB} isImage={isImage} />
          </Section>

          <Section title="Compression results">
            {view?.compress ? (
              <CompressionResults compress={view.compress} memory={view.memory} />
            ) : (
              <Text fontSize="sm" color="gray.500">Run a test to see results.</Text>
            )}
          </Section>

          <Section title="Upload (multipart)">
            {view && Object.keys(view.uploads).length ? (
              <VStack align="stretch" spacing={8}>
                {view.uploads.compressed && <UploadMetrics label="Compressed" upload={view.uploads.compressed} />}
                {view.uploads.original && <UploadMetrics label="Original" upload={view.uploads.original} />}
              </VStack>
            ) : (
              <Text fontSize="sm" color="gray.500">Run a test to see the part waterfall.</Text>
            )}
          </Section>

          <Section title="Download benchmarks" badge={runDownloads ? undefined : <Badge>off</Badge>}>
            {!runDownloads ? (
              <Text fontSize="sm" color="gray.500">
                Turn on &quot;Download benchmarks&quot; above the Run button, then run again. Results appear here after
                the upload finishes (they do not block the Preview).
              </Text>
            ) : view && Object.keys(view.downloads).length === 0 ? (
              <Text fontSize="sm" color="gray.500">
                {running
                  ? "Waiting for upload to finish, then download benches run automatically…"
                  : view.uploads.compressed && !view.uploads.compressed.ok
                    ? `Upload failed, so there is nothing to download. ${view.uploads.compressed.error ?? ""}`
                    : view.uploads.compressed?.ok && !view.uploads.compressed.cdnUrl
                      ? "Upload finished but no CDN URL was returned — download benches need that URL."
                      : "No download benchmarks yet. Run a test with this checkbox on."}
              </Text>
            ) : (
              <DownloadBench downloads={view?.downloads ?? {}} />
            )}
          </Section>

          <Section title="Compare configs">
            <VStack align="stretch" spacing={3}>
              <Text fontSize="sm" color="gray.600">
                Pick 2–4 configs; the selected file runs through each one after another.
              </Text>
              <Wrap>
                {compareOptions.map((o) => (
                  <WrapItem key={o.id}>
                    <Checkbox
                      size="sm"
                      isChecked={compareSel.includes(o.id)}
                      onChange={(e) =>
                        setCompareSel((s) => (e.target.checked ? [...s, o.id].slice(-4) : s.filter((x) => x !== o.id)))
                      }
                    >
                      {o.label}
                    </Checkbox>
                    {o.id.startsWith("variant-") && (
                      <Button size="xs" variant="ghost" onClick={() => persistVariants(variants.filter((v) => v.id !== o.id))}>
                        ✕
                      </Button>
                    )}
                  </WrapItem>
                ))}
              </Wrap>
              <HStack flexWrap="wrap" gap={2}>
                <Input size="sm" maxW="220px" placeholder="Variant name" value={variantName} onChange={(e) => setVariantName(e.target.value)} />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const label = variantName.trim() || describeConfig(config);
                    persistVariants([...variants, { id: `variant-${Date.now()}`, label, config }]);
                    setVariantName("");
                  }}
                >
                  Save current as variant
                </Button>
                <Button
                  size="sm"
                  colorScheme="purple"
                  onClick={runCompare}
                  isDisabled={!file || running || compareSel.length < 2}
                >
                  Run compare ({Math.min(4, compareSel.length)})
                </Button>
              </HStack>
              {compareCols.length > 0 && (
                <>
                  <CompareTable
                    columns={compareCols}
                    selected={comparePick}
                    onToggle={(i) => setComparePick((p) => (p.includes(i) ? p : [p[1] ?? p[0], i]))}
                  />
                  {pickA && pickB && (
                    <ComparePlayers
                      isImage={isImage}
                      a={{ title: pickA.label, src: pickA.view.media.compressed, poster: pickA.view.media.poster, stats: statBlock(pickA.view, "compressed") }}
                      b={{ title: pickB.label, src: pickB.view.media.compressed, poster: pickB.view.media.poster, stats: statBlock(pickB.view, "compressed") }}
                    />
                  )}
                  <Button size="xs" alignSelf="start" variant="ghost" onClick={() => setView(compareCols[comparePick[0]]?.view ?? null)}>
                    Show first selected in main panels
                  </Button>
                </>
              )}
            </VStack>
          </Section>

          <Section title="History" badge={<Badge>{history.data?.runs.length ?? 0}</Badge>}>
            {history.error ? (
              <Alert status="error" fontSize="sm">
                <AlertIcon />
                Could not load history.
              </Alert>
            ) : (
              <VStack align="stretch" spacing={2}>
                <Text fontSize="sm" color="gray.600">
                  Runs are saved when &quot;Save to history&quot; is checked (on by default). Click <strong>Load</strong> to
                  refill Preview / Compression / Upload / Downloads from a past run.
                </Text>
                <RunHistory
                  runs={history.data?.runs ?? []}
                  onLoad={loadHistory}
                  onDelete={deleteHistory}
                  activeId={view?.source === "history" ? view.runId : null}
                />
              </VStack>
            )}
          </Section>
        </Accordion>
      </VStack>
    </NavContainer>
  );
}
