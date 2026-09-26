import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Alert,
  AlertIcon,
  Box,
  Button,
  HStack,
  Input,
  SimpleGrid,
  Text,
  Textarea,
  VStack,
  Wrap,
  WrapItem,
} from "@chakra-ui/react";
import { useEffect, useState } from "react";
import {
  PRODUCTION_UPLOAD_CONFIG,
  mergeUploadConfig,
  type AudioCodecChoice,
  type HardwareAcceleration,
  type ImageConfig,
  type Mp4Layout,
  type PosterConfig,
  type QualityPreset,
  type TransportConfig,
  type UploadConfig,
  type VideoCodecChoice,
  type VideoConfig,
} from "../../lib/upload/config";
import { PRESETS, RETRY_PRESETS, presetIdFor } from "../../lib/uploadTesting/presets";
import { VIDEO_CODEC_LABELS, type CodecSupport } from "../../lib/uploadTesting/codecs";
import { NullableNumField, NumField, SelectField, SwitchField } from "./fields";

type Props = {
  config: UploadConfig;
  onChange: (c: UploadConfig) => void;
  codecSupport: CodecSupport | null;
  onLoadProduction: () => void;
  loadingProduction?: boolean;
};

const QUALITY: QualityPreset[] = ["very-low", "low", "medium", "high", "very-high"];

export default function ConfigPanel({ config, onChange, codecSupport, onLoadProduction, loadingProduction }: Props) {
  const t = config.transport;
  const v = config.video;
  const setT = (p: Partial<TransportConfig>) => onChange({ ...config, transport: { ...t, ...p } });
  const setV = (p: Partial<VideoConfig>) => onChange({ ...config, video: { ...v, ...p } });
  const setA = (p: Partial<VideoConfig["audio"]>) => setV({ audio: { ...v.audio, ...p } });
  const setI = (p: Partial<ImageConfig>) => onChange({ ...config, image: { ...config.image, ...p } });
  const setP = (p: Partial<PosterConfig>) => onChange({ ...config, poster: { ...config.poster, ...p } });
  const activePreset = presetIdFor(config);

  const thresholdMode = typeof t.multipartThresholdMB === "number" ? "above" : t.multipartThresholdMB;
  const retryPreset = RETRY_PRESETS.find((r) => JSON.stringify(r.delays) === JSON.stringify(t.retryDelaysMs))?.id ?? "custom";
  const bitrateMode = typeof v.bitrate === "number" ? "fixed" : v.bitrate;

  return (
    <VStack align="stretch" spacing={3}>
      <Wrap>
        {PRESETS.map((p) => (
          <WrapItem key={p.id}>
            <Button
              size="sm"
              colorScheme={activePreset === p.id ? "purple" : undefined}
              variant={activePreset === p.id ? "solid" : "outline"}
              onClick={() => onChange(p.config)}
            >
              {p.label}
            </Button>
          </WrapItem>
        ))}
        <WrapItem>
          <Button size="sm" variant="ghost" onClick={onLoadProduction} isLoading={loadingProduction}>
            Load production config
          </Button>
        </WrapItem>
      </Wrap>

      <Accordion allowMultiple>
        <AccordionItem>
          <AccordionButton px={2}>
            <Box flex="1" textAlign="left" fontWeight="semibold" fontSize="sm">
              Transport (Uppy multipart)
            </Box>
            <AccordionIcon />
          </AccordionButton>
          <AccordionPanel px={2}>
            <SimpleGrid columns={{ base: 1, sm: 2, md: 3 }} spacing={3}>
              <SelectField
                label="Multipart"
                value={thresholdMode}
                options={[
                  { value: "always", label: "Always" },
                  { value: "never", label: "Never (single PUT)" },
                  { value: "above", label: "Above N MB" },
                ]}
                onChange={(m) => setT({ multipartThresholdMB: m === "above" ? 20 : m })}
              />
              {typeof t.multipartThresholdMB === "number" && (
                <NumField
                  label="Threshold (MB)"
                  value={t.multipartThresholdMB}
                  min={0}
                  max={5120}
                  onChange={(n) => setT({ multipartThresholdMB: n })}
                />
              )}
              <NumField
                label="Part size (MB)"
                value={t.partSizeMB}
                min={5}
                max={64}
                onChange={(n) => setT({ partSizeMB: n })}
                help="S3 minimum 5 MB (except last part), max 10,000 parts."
              />
              <NumField label="Concurrency" value={t.concurrency} min={1} max={10} onChange={(n) => setT({ concurrency: n })} />
              <SelectField
                label="Retry schedule"
                value={retryPreset}
                options={[
                  ...RETRY_PRESETS.map((r) => ({ value: r.id, label: r.label })),
                  { value: "custom", label: "Custom" },
                ]}
                onChange={(id) => {
                  const r = RETRY_PRESETS.find((x) => x.id === id);
                  if (r) setT({ retryDelaysMs: r.delays });
                }}
              />
              <RetryInput delays={t.retryDelaysMs} onChange={(d) => setT({ retryDelaysMs: d })} />
              <NullableNumField
                label="Part timeout (ms)"
                value={t.partTimeoutMs}
                defaultValue={60_000}
                nullLabel="No timeout"
                min={1000}
                max={3_600_000}
                step={1000}
                onChange={(n) => setT({ partTimeoutMs: n })}
              />
              <NullableNumField
                label="Signed URL lifetime (s)"
                value={t.signExpiresSec}
                defaultValue={60}
                nullLabel="Server default (15 min)"
                min={30}
                max={3600}
                onChange={(n) => setT({ signExpiresSec: n })}
                help="Sandbox keys only; clamped 30s–1h."
              />
            </SimpleGrid>
          </AccordionPanel>
        </AccordionItem>

        <AccordionItem>
          <AccordionButton px={2}>
            <Box flex="1" textAlign="left" fontWeight="semibold" fontSize="sm">
              Video compression
            </Box>
            <AccordionIcon />
          </AccordionButton>
          <AccordionPanel px={2}>
            <SimpleGrid columns={{ base: 1, sm: 2, md: 3 }} spacing={3}>
              <SwitchField label="Enabled" isChecked={v.enabled} onChange={(b) => setV({ enabled: b })} />
              <SwitchField label="Run in Web Worker" isChecked={v.useWorker} onChange={(b) => setV({ useWorker: b })} />
              <NumField label="Only if larger than (MB)" value={v.minSizeMB} min={0} step={0.5} precision={1} onChange={(n) => setV({ minSizeMB: n })} />
              <SelectField
                label="Max long edge"
                value={String(v.maxLongEdge ?? "orig")}
                options={[
                  ...["480", "640", "854", "960", "1280", "1920", "2560", "3840"].map((x) => ({ value: x, label: `${x}px` })),
                  { value: "orig", label: "Original" },
                ]}
                onChange={(x) => setV({ maxLongEdge: x === "orig" ? null : Number(x) })}
              />
              <SelectField<VideoCodecChoice>
                label="Codec"
                value={v.codec}
                options={(Object.keys(VIDEO_CODEC_LABELS) as VideoCodecChoice[]).map((c) => ({
                  value: c,
                  label: `${VIDEO_CODEC_LABELS[c]}${codecSupport && !codecSupport.video[c] ? " — unsupported here" : ""}`,
                  disabled: codecSupport != null && !codecSupport.video[c] && c !== v.codec,
                }))}
                onChange={(c) => setV({ codec: c })}
                help={v.codec !== "avc" ? "Non-H.264 output may not play on every phone." : codecSupport ? undefined : "Checking encoder support…"}
              />
              <SelectField
                label="Bitrate mode"
                value={bitrateMode}
                options={[{ value: "fixed", label: "Fixed Mbps" }, ...QUALITY.map((q) => ({ value: q, label: `Quality: ${q}` }))]}
                onChange={(m) => setV({ bitrate: m === "fixed" ? 2_500_000 : (m as QualityPreset) })}
              />
              {typeof v.bitrate === "number" && (
                <NumField
                  label="Bitrate (Mbps)"
                  value={v.bitrate / 1e6}
                  min={0.1}
                  max={50}
                  step={0.1}
                  precision={2}
                  onChange={(n) => setV({ bitrate: Math.round(n * 1e6) })}
                />
              )}
              <SelectField
                label="Frame rate cap"
                value={String(v.maxFrameRate ?? "orig")}
                options={[
                  { value: "24", label: "24 fps" },
                  { value: "30", label: "30 fps" },
                  { value: "60", label: "60 fps" },
                  { value: "orig", label: "Original" },
                ]}
                onChange={(x) => setV({ maxFrameRate: x === "orig" ? null : Number(x) })}
              />
              <NumField
                label="Keyframe interval (s)"
                value={v.keyFrameIntervalSec}
                min={0.5}
                max={10}
                step={0.5}
                precision={1}
                onChange={(n) => setV({ keyFrameIntervalSec: n })}
              />
              <SelectField<HardwareAcceleration>
                label="Hardware acceleration"
                value={v.hardwareAcceleration}
                options={[
                  { value: "no-preference", label: "No preference" },
                  { value: "prefer-hardware", label: "Prefer hardware" },
                  { value: "prefer-software", label: "Prefer software" },
                ]}
                onChange={(h) => setV({ hardwareAcceleration: h })}
              />
              <SelectField<Mp4Layout>
                label="MP4 layout"
                value={v.mp4Layout}
                options={[
                  { value: "in-memory", label: "Faststart (in-memory)" },
                  { value: "fragmented", label: "Fragmented (low memory)" },
                  { value: "none", label: "None (moov at end)" },
                ]}
                onChange={(m) => setV({ mp4Layout: m })}
              />
              <NumField
                label="Time budget × duration"
                value={v.timeBudgetMultiplier}
                min={0.1}
                max={100}
                step={0.1}
                precision={1}
                onChange={(n) => setV({ timeBudgetMultiplier: n })}
              />
              <NumField label="Min time budget (s)" value={v.minTimeBudgetSec} min={1} max={3600} onChange={(n) => setV({ minTimeBudgetSec: n })} />
            </SimpleGrid>
            <Text fontWeight="semibold" fontSize="sm" mt={4} mb={2}>
              Audio
            </Text>
            <SimpleGrid columns={{ base: 1, sm: 3 }} spacing={3}>
              <SwitchField label="Drop audio" isChecked={v.audio.drop} onChange={(b) => setA({ drop: b })} />
              <SelectField<AudioCodecChoice>
                label="Audio codec"
                value={v.audio.codec}
                options={(["aac", "opus"] as const).map((c) => ({
                  value: c,
                  label: `${c.toUpperCase()}${codecSupport && !codecSupport.audio[c] ? " — unsupported here" : ""}`,
                }))}
                onChange={(c) => setA({ codec: c })}
              />
              <NumField
                label="Audio bitrate (kbps)"
                value={v.audio.bitrate / 1000}
                min={32}
                max={320}
                step={16}
                onChange={(n) => setA({ bitrate: Math.round(n * 1000) })}
              />
            </SimpleGrid>
          </AccordionPanel>
        </AccordionItem>

        <AccordionItem>
          <AccordionButton px={2}>
            <Box flex="1" textAlign="left" fontWeight="semibold" fontSize="sm">
              Image & poster
            </Box>
            <AccordionIcon />
          </AccordionButton>
          <AccordionPanel px={2}>
            <SimpleGrid columns={{ base: 1, sm: 2, md: 3 }} spacing={3}>
              <SwitchField label="Image compression" isChecked={config.image.enabled} onChange={(b) => setI({ enabled: b })} />
              <NumField label="Image: only if > MB" value={config.image.minSizeMB} min={0} step={0.1} precision={1} onChange={(n) => setI({ minSizeMB: n })} />
              <NumField label="Image max long edge" value={config.image.maxLongEdge} min={64} max={8192} step={128} onChange={(n) => setI({ maxLongEdge: n })} />
              <SelectField<ImageConfig["format"]>
                label="Image format"
                value={config.image.format}
                options={[
                  { value: "jpeg", label: "JPEG" },
                  { value: "webp", label: "WebP" },
                ]}
                onChange={(f) => setI({ format: f })}
              />
              <NumField label="Image quality" value={config.image.quality} min={0.1} max={1} step={0.02} precision={2} onChange={(n) => setI({ quality: n })} />
              <Box />
              <SwitchField label="Poster" isChecked={config.poster.enabled} onChange={(b) => setP({ enabled: b })} />
              <NumField label="Poster at (s)" value={config.poster.atSec} min={0} step={0.5} precision={1} onChange={(n) => setP({ atSec: n })} />
              <NumField label="Poster width" value={config.poster.width} min={64} max={4096} step={32} onChange={(n) => setP({ width: n })} />
              <NumField label="Poster JPEG quality" value={config.poster.quality} min={0.1} max={1} step={0.05} precision={2} onChange={(n) => setP({ quality: n })} />
              <NumField label="Poster timeout (ms)" value={config.poster.timeoutMs} min={1000} max={60000} step={500} onChange={(n) => setP({ timeoutMs: n })} />
            </SimpleGrid>
          </AccordionPanel>
        </AccordionItem>

        <AccordionItem>
          <AccordionButton px={2}>
            <Box flex="1" textAlign="left" fontWeight="semibold" fontSize="sm">
              JSON
            </Box>
            <AccordionIcon />
          </AccordionButton>
          <AccordionPanel px={2}>
            <JsonEditor config={config} onChange={onChange} />
          </AccordionPanel>
        </AccordionItem>
      </Accordion>
    </VStack>
  );
}

function RetryInput({ delays, onChange }: { delays: number[]; onChange: (d: number[]) => void }) {
  const [text, setText] = useState(delays.join(", "));
  useEffect(() => setText(delays.join(", ")), [delays]);
  return (
    <Box>
      <Text fontSize="sm" mb={1}>
        Retry delays (ms, comma-separated)
      </Text>
      <Input
        size="sm"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const parsed = text
            .split(/[\s,]+/)
            .filter(Boolean)
            .map(Number)
            .filter((n) => Number.isFinite(n) && n >= 0);
          onChange(parsed);
        }}
      />
    </Box>
  );
}

function JsonEditor({ config, onChange }: { config: UploadConfig; onChange: (c: UploadConfig) => void }) {
  const [text, setText] = useState(() => JSON.stringify(config, null, 2));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setText(JSON.stringify(config, null, 2)), [config]);
  return (
    <VStack align="stretch">
      <Textarea fontFamily="mono" fontSize="xs" rows={16} value={text} onChange={(e) => setText(e.target.value)} />
      {error && (
        <Alert status="error" fontSize="sm">
          <AlertIcon />
          {error}
        </Alert>
      )}
      <HStack>
        <Button
          size="sm"
          onClick={() => {
            try {
              onChange(mergeUploadConfig(PRODUCTION_UPLOAD_CONFIG, JSON.parse(text)));
              setError(null);
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            }
          }}
        >
          Apply JSON
        </Button>
        <Button size="sm" variant="ghost" onClick={() => navigator.clipboard?.writeText(text)}>
          Copy
        </Button>
        <Text fontSize="xs" color="gray.500">
          Values are validated and clamped (unknown keys dropped).
        </Text>
      </HStack>
    </VStack>
  );
}
