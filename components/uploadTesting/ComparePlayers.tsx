import { Box, Button, HStack, SimpleGrid, Text, VStack } from "@chakra-ui/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { SwitchField } from "./fields";

export type PlayerSide = {
  title: string;
  src: string | null;
  poster?: string | null;
  stats?: ReactNode;
};

type Props = { a: PlayerSide; b: PlayerSide; isImage?: boolean };

/** Mirrors play/pause/seek from `source` to `target` while `enabled`. */
function useSync(
  enabled: boolean,
  refs: [React.RefObject<HTMLVideoElement>, React.RefObject<HTMLVideoElement>],
  deps: unknown[],
) {
  useEffect(() => {
    const [ra, rb] = refs;
    const va = ra.current;
    const vb = rb.current;
    if (!enabled || !va || !vb) return;
    let applying = false;
    const link = (from: HTMLVideoElement, to: HTMLVideoElement) => {
      const guard = (fn: () => void) => () => {
        if (applying) return;
        applying = true;
        try {
          fn();
        } finally {
          setTimeout(() => {
            applying = false;
          }, 50);
        }
      };
      const onPlay = guard(() => {
        to.currentTime = from.currentTime;
        void to.play().catch(() => {});
      });
      const onPause = guard(() => to.pause());
      const onSeek = guard(() => {
        to.currentTime = from.currentTime;
      });
      from.addEventListener("play", onPlay);
      from.addEventListener("pause", onPause);
      from.addEventListener("seeked", onSeek);
      return () => {
        from.removeEventListener("play", onPlay);
        from.removeEventListener("pause", onPause);
        from.removeEventListener("seeked", onSeek);
      };
    };
    const offA = link(va, vb);
    const offB = link(vb, va);
    return () => {
      offA();
      offB();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);
}

function Media({
  side,
  isImage,
  videoRef,
  hidden,
}: {
  side: PlayerSide;
  isImage?: boolean;
  videoRef: React.RefObject<HTMLVideoElement>;
  hidden?: boolean;
}) {
  if (!side.src) {
    return (
      <Box bg="gray.100" h="200px" display="flex" alignItems="center" justifyContent="center" fontSize="sm" color="gray.500">
        no media
      </Box>
    );
  }
  const style = { width: "100%", maxHeight: "60vh", background: "#000", visibility: hidden ? "hidden" : "visible" } as const;
  return isImage ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={side.src} alt={side.title} style={{ ...style, objectFit: "contain" }} />
  ) : (
    <video ref={videoRef} src={side.src} poster={side.poster ?? undefined} controls muted playsInline preload="metadata" style={style} />
  );
}

export default function ComparePlayers({ a, b, isImage }: Props) {
  const refA = useRef<HTMLVideoElement>(null);
  const refB = useRef<HTMLVideoElement>(null);
  const [sync, setSync] = useState(true);
  const [flip, setFlip] = useState(false);
  const [showB, setShowB] = useState(false);
  useSync(sync && !isImage, [refA, refB], [a.src, b.src, flip]);

  return (
    <VStack align="stretch" spacing={3}>
      <HStack spacing={4} flexWrap="wrap">
        {!isImage && <SwitchField label="Sync play/pause/seek" isChecked={sync} onChange={setSync} />}
        <SwitchField label="A/B flip (same spot)" isChecked={flip} onChange={setFlip} />
        {flip && (
          <Button size="sm" onClick={() => setShowB((s) => !s)}>
            Showing {showB ? "B" : "A"}: {showB ? b.title : a.title} — flip
          </Button>
        )}
      </HStack>
      {flip ? (
        <Box position="relative">
          <Box>
            <Media side={a} isImage={isImage} videoRef={refA} hidden={showB} />
          </Box>
          <Box position="absolute" inset={0}>
            <Media side={b} isImage={isImage} videoRef={refB} hidden={!showB} />
          </Box>
          <Box mt={2}>{showB ? b.stats : a.stats}</Box>
        </Box>
      ) : (
        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
          {[
            [a, refA],
            [b, refB],
          ].map(([side, ref], i) => {
            const s = side as PlayerSide;
            return (
              <VStack key={i} align="stretch" spacing={1}>
                <Text fontWeight="semibold" fontSize="sm">
                  {i === 0 ? "A" : "B"}: {s.title}
                </Text>
                <Media side={s} isImage={isImage} videoRef={ref as React.RefObject<HTMLVideoElement>} />
                <Box fontSize="xs">{s.stats}</Box>
              </VStack>
            );
          })}
        </SimpleGrid>
      )}
      {(a.poster || b.poster) && !isImage && (
        <HStack align="start">
          <Text fontSize="xs" color="gray.500">
            Poster:
          </Text>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={(b.poster || a.poster)!} alt="poster" style={{ maxWidth: 160, borderRadius: 4 }} />
        </HStack>
      )}
    </VStack>
  );
}
