import React, { useRef, useEffect, useState } from "react";
import FooterLeft from "./FooterLeft";
import FooterRight from "./FooterRight";
import CommentsDrawer from "./CommentsDrawer";

const VideoCard = (props) => {
  const {
    url,
    username,
    description,
    song,
    likes,
    shares,
    comments,
    saves,
    profilePic,
    setVideoRef,
    autoplay,
    submissionId
  } = props;
  const videoRef = useRef(null);
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [actualLikes, setActualLikes] = useState(likes);

  useEffect(() => {
    // Fetch real like count
    const fetchLikes = async () => {
      try {
        const response = await fetch(`/api/likes?submissionId=${submissionId}`);
        if (response.ok) {
          const data = await response.json();
          setActualLikes(data.likes);
        }
      } catch (error) {
        console.error("Failed to fetch likes:", error);
      }
    };
    fetchLikes();
  }, [submissionId]);

  useEffect(() => {
    if (autoplay) {
      videoRef.current.play();
    }
  }, [autoplay]);

  const onVideoPress = () => {
    if (videoRef.current.paused) {
      videoRef.current.play();
    } else {
      videoRef.current.pause();
    }
  };

  return (
    <>
      <div className="video" suppressHydrationWarning>
        {/* The video element */}
        <video
          className="player"
          playsinline="true"
          onClick={onVideoPress}
          ref={(ref) => {
            videoRef.current = ref;
            setVideoRef(ref);
          }}
          loop
          src={url}
        ></video>
        <div className="bottom-controls">
          <div className="footer-left">
            {/* The left part of the container */}
            <FooterLeft
              username={username}
              description={description}
              song={song}
            />
          </div>
          <div className="footer-right">
            {/* The right part of the container */}
            <FooterRight
              likes={actualLikes}
              shares={shares}
              comments={comments}
              saves={saves}
              profilePic={profilePic}
              submissionId={submissionId}
              onCommentClick={() => setIsCommentsOpen(true)}
              onLikeUpdate={(newLikes) => setActualLikes(newLikes)}
            />
          </div>
        </div>
      </div>
      <CommentsDrawer
        isOpen={isCommentsOpen}
        onClose={() => setIsCommentsOpen(false)}
        submissionId={submissionId}
        initialCommentCount={comments}
      />
    </>
  );
};

export default VideoCard;
