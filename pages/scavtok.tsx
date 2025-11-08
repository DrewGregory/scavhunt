import { serializedTeamSchema } from "../models/Team";
import { GetServerSidePropsContext, InferGetServerSidePropsType } from "next";
import { dbConnect } from "../lib/dbConnect";
import {
  serializedSubmissionSchema,
  SubmissionModel
} from "../models/Submission";
import { z } from "zod";
import { serializedChallengeSchema } from "../models/Challenge";
import { getTeamFromCookie } from "../lib/team";
import { useEffect, useRef, useState } from "react";
import VideoCard from "./components/VideoCard";
import BottomNavbar from "./components/BottomNavbar";
import TopNavbar from "./components/TopNavbar";

const submissionWithLookupsSchema = serializedSubmissionSchema.merge(
  z.object({
    team: serializedTeamSchema,
    challenge: serializedChallengeSchema
  })
);

export const getServerSideProps = async (
  context: GetServerSidePropsContext
) => {
  await dbConnect();
  const teamRaw = await getTeamFromCookie(context.req.cookies);

  if (teamRaw == null) {
    return {
      props: {
        team: null,
        submissions: []
      }
    };
  }

  const submissionsRaw = await SubmissionModel.aggregate([
    {
      $sort: {
        createdAt: -1
      }
    },
    {
      $lookup: {
        from: "teams",
        localField: "teamId",
        foreignField: "_id",
        as: "team"
      }
    },
    {
      $lookup: {
        from: "challenges",
        localField: "challengeId",
        foreignField: "_id",
        as: "challenge"
      }
    },
    {
      $unwind: {
        path: "$challenge",
        preserveNullAndEmptyArrays: true
      }
    },
    {
      $unwind: {
        path: "$team",
        preserveNullAndEmptyArrays: true
      }
    }
  ]);
  const submissions = z
    .array(submissionWithLookupsSchema)
    .parse(submissionsRaw);

  return {
    props: {
      submissions
    }
  };
};

export default function Page({
  submissions
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const videoRefs = useRef<any>([]);
  const containerRef = useRef<any>(null);
  const videoContainerRefs = useRef<any>([]);
  const [videoStats, setVideoStats] = useState<{
    likes: Record<string, number>;
    comments: Record<string, number>;
  }>({ likes: {}, comments: {} });

  const submissionsWithVideos = submissions.filter(
    (submission) =>
      submission.mediaURL &&
      submission.mediaURL
        .toLowerCase()
        .match(/\.(mpg|mp2|mpeg|mpe|mpv|mov|mp4)$/i)
  );

  const scrollToVideo = (submissionId: string) => {
    const index = submissionsWithVideos.findIndex((s) => s._id === submissionId);
    if (index !== -1 && videoRefs.current[index]) {
      videoRefs.current[index].scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  useEffect(() => {
    const fetchVideoStats = async () => {
      try {
        const response = await fetch("/api/video-stats");
        if (response.ok) {
          const data = await response.json();
          setVideoStats(data);
        }
      } catch (error) {
        console.error("Failed to fetch video stats:", error);
      }
    };
    fetchVideoStats();
  }, []);

  useEffect(() => {
    // Scroll container to top on mount to ensure first video is visible
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const observerOptions = {
      root: null,
      rootMargin: "0px",
      threshold: 0.8 // Adjust this value to change the scroll trigger point
    };

    // This function handles the intersection of videos
    const handleIntersection = (entries: any) => {
      entries.forEach((entry: any) => {
        if (entry.isIntersecting) {
          const videoElement = entry.target;
          videoElement.play();
        } else {
          const videoElement = entry.target;
          videoElement.pause();
        }
      });
    };

    const observer = new IntersectionObserver(
      handleIntersection,
      observerOptions
    );

    // We observe each video reference to trigger play/pause
    videoRefs.current.forEach((videoRef: any) => {
      observer.observe(videoRef);
    });

    // We disconnect the observer when the component is unmounted
    return () => {
      observer.disconnect();
    };
  }, [submissions]);

  // This function handles the reference of each video
  const handleVideoRef = (index: any) => (ref: any) => {
    videoRefs.current[index] = ref;
  };

  const randomIntFromInterval = (min: number, max: number) => {
    return Math.floor(Math.random() * (max - min + 1) + min);
  };

  const updateCommentCount = (submissionId: string) => {
    setVideoStats((prev) => ({
      ...prev,
      comments: {
        ...prev.comments,
        [submissionId]: (prev.comments[submissionId] || 0) + 1
      }
    }));
  };

  const updateLikeCount = (submissionId: string, newCount: number) => {
    setVideoStats((prev) => ({
      ...prev,
      likes: {
        ...prev.likes,
        [submissionId]: newCount
      }
    }));
  };

  return (
    <div className="scavtok" suppressHydrationWarning>
      <div className="app">
        <div className="container" ref={containerRef}>
          <TopNavbar onVideoSelect={scrollToVideo} />
          {/* Here we map over the videos array and create VideoCard components */}
          {submissionsWithVideos.map((submission, index) => (
            <VideoCard
              key={index}
              submissionId={submission._id}
              username={submission.team.emoji + " " + submission.team.name}
              description={submission.note}
              song={""}
              likes={videoStats.likes[submission._id] || randomIntFromInterval(100, 2000)}
              comments={videoStats.comments[submission._id] || 0}
              url={submission.mediaURL}
              profilePic={submission.team.emoji}
              setVideoRef={handleVideoRef(index)}
              autoplay={index === 0}
              onCommentAdded={() => updateCommentCount(submission._id)}
              onLikeUpdate={(newCount) => updateLikeCount(submission._id, newCount)}
              suppressHydrationWarning
            />
          ))}
          <BottomNavbar />
        </div>
      </div>
    </div>
  );
}
