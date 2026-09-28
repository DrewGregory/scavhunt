import React, { useEffect, useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faHeart,
  faVolumeHigh,
  faVolumeXmark,
} from "@fortawesome/free-solid-svg-icons";
import { Text } from "@chakra-ui/react";
import {
  LuArrowDown,
  LuArrowUp,
  LuChevronsDown,
  LuChevronsUp,
  LuPlay,
} from "react-icons/lu";
import FooterLeft from "../pages/components/FooterLeft";
import type { FeedSubmissionItem } from "../lib/feedTypes";
import type { SerializedTeam } from "../lib/types";
import { useRegisterMedia, type PreloadQueue } from "../lib/preloadQueue";
import { usePlaybackTelemetry } from "../lib/playbackTelemetry";

export type ScavTokDirection = "forward" | "backward";

type Props = {
  item: FeedSubmissionItem;
  team: SerializedTeam;
  index: number;
  queue: PreloadQueue;
  isCurrent: boolean;
  muted: boolean;
  onToggleMute: () => void;
  onAutoplayBlocked: () => void;
  onToggleFavorite: (id: string) => void;
  /** Fired when the current video finishes (only when auto-advance is on). */
  onEnded?: (id: string) => void;
  autoAdvance: boolean;
  direction: ScavTokDirection;
  onJumpStart: () => void;
  onJumpEnd: () => void;
  onToggleAutoAdvance: () => void;
  onToggleDirection: () => void;
};

const iconButtonStyle: React.CSSProperties = {
  position: "absolute",
  top: 60,
  right: 12,
  zIndex: 101,
  width: 36,
  height: 36,
  borderRadius: "50%",
  border: "none",
  background: "rgba(0, 0, 0, 0.45)",
  color: "#fff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
};

const sidebarBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  margin: 0,
  color: "inherit",
  cursor: "pointer",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  lineHeight: 1,
};

export default function ScavTokVideoCard({
  item,
  team,
  index,
  queue,
  isCurrent,
  muted,
  onToggleMute,
  onAutoplayBlocked,
  onToggleFavorite,
  onEnded,
  autoAdvance,
  direction,
  onJumpStart,
  onJumpEnd,
  onToggleAutoAdvance,
  onToggleDirection,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;
  const autoAdvanceRef = useRef(autoAdvance);
  autoAdvanceRef.current = autoAdvance;

  const { posterReady } = useRegisterMedia(queue, containerRef, videoRef, {
    id: item.id,
    index,
    posterUrl: item.posterURL,
    videoUrl: item.mediaURL,
    hasPoster: !!item.posterURL,
    compressed: item.compressed,
    sizeBytes: item.sizeBytes,
  });

  const markPlayIntent = usePlaybackTelemetry(videoRef, {
    submissionId: item.id,
    challengeId: item.challengeId,
    source: "scavtok",
    compressed: item.compressed,
    sizeBytes: item.sizeBytes,
  });

  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const blockedRef = useRef(onAutoplayBlocked);
  blockedRef.current = onAutoplayBlocked;

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (!isCurrent) {
      v.pause();
      return;
    }
    markPlayIntent("current");
    v.muted = mutedRef.current;
    v.play().catch((err: unknown) => {
      if (
        !v.muted &&
        err instanceof DOMException &&
        err.name === "NotAllowedError"
      ) {
        v.muted = true;
        blockedRef.current();
        v.play().catch(() => undefined);
      }
    });
  }, [isCurrent, markPlayIntent]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const handleEnded = () => {
      if (!autoAdvanceRef.current) return;
      onEndedRef.current?.(item.id);
    };
    v.addEventListener("ended", handleEnded);
    return () => v.removeEventListener("ended", handleEnded);
  }, [item.id]);

  const onVideoPress = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      markPlayIntent("tap");
      v.play().catch(() => undefined);
    } else {
      v.pause();
    }
  };

  return (
    <div className="video" ref={containerRef}>
      <video
        className="player"
        ref={videoRef}
        onClick={onVideoPress}
        poster={posterReady && item.posterURL ? item.posterURL : undefined}
        muted={muted}
        playsInline
        loop={!autoAdvance}
      />
      {isCurrent && (
        <button
          type="button"
          aria-label={muted ? "Unmute" : "Mute"}
          style={iconButtonStyle}
          onClick={onToggleMute}
        >
          <FontAwesomeIcon
            icon={muted ? faVolumeXmark : faVolumeHigh}
            style={{ width: 16, height: 16 }}
          />
        </button>
      )}
      <div className="bottom-controls">
        <div className="footer-left">
          <FooterLeft
            username={`${team.emoji} ${team.name}`}
            description={item.note}
          />
        </div>
        <div className="footer-right">
          <div className="sidebar-icon">
            <button
              type="button"
              style={sidebarBtnStyle}
              aria-label="Jump to start"
              onClick={onJumpStart}
            >
              <LuChevronsUp size={28} color="white" />
              <p>Start</p>
            </button>
          </div>
          <div className="sidebar-icon">
            <button
              type="button"
              style={sidebarBtnStyle}
              aria-label="Jump to end"
              onClick={onJumpEnd}
            >
              <LuChevronsDown size={28} color="white" />
              <p>End</p>
            </button>
          </div>
          <div className="sidebar-icon">
            <button
              type="button"
              style={sidebarBtnStyle}
              aria-label={
                autoAdvance ? "Turn off auto-advance" : "Turn on auto-advance"
              }
              onClick={onToggleAutoAdvance}
            >
              <LuPlay
                size={28}
                color={autoAdvance ? "#68D391" : "white"}
                fill={autoAdvance ? "#68D391" : "none"}
              />
              <p style={{ color: autoAdvance ? "#68D391" : undefined }}>Auto</p>
            </button>
          </div>
          <div className="sidebar-icon">
            <button
              type="button"
              style={sidebarBtnStyle}
              aria-label={
                direction === "forward"
                  ? "Auto-advance forward; tap for backward"
                  : "Auto-advance backward; tap for forward"
              }
              onClick={onToggleDirection}
            >
              {direction === "forward" ? (
                <LuArrowDown size={28} color="white" />
              ) : (
                <LuArrowUp size={28} color="white" />
              )}
              <p>{direction === "forward" ? "Fwd" : "Back"}</p>
            </button>
          </div>
          <div className="sidebar-icon">
            <Text>{team.emoji}</Text>
          </div>
          <div className="sidebar-icon">
            <FontAwesomeIcon
              icon={faHeart}
              style={{
                width: "35px",
                height: "35px",
                color: item.favorited ? "#FF0000" : "white",
                cursor: "pointer",
              }}
              onClick={() => onToggleFavorite(item.id)}
            />
            <p>{item.favoriteCount}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
