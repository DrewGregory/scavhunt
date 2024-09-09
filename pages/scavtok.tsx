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
import { useEffect, useRef } from "react";
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

  const submissionsWithVideos = submissions.filter(
    (submission) =>
      submission.mediaURL &&
      submission.mediaURL
        .toLowerCase()
        .match(/\.(mpg|mp2|mpeg|mpe|mpv|mov|mp4)$/i)
  );

  const randomIntFromInterval = (min: number, max: number) => {
    return Math.floor(Math.random() * (max - min + 1) + min);
  };

  return (
    <div className="scavtok" suppressHydrationWarning>
      <div className="app">
        <div className="container">
          <TopNavbar />
          {/* Here we map over the videos array and create VideoCard components */}
          {submissionsWithVideos.map((submission, index) => (
            <VideoCard
              key={index}
              username={submission.team.emoji + " " + submission.team.name}
              description={submission.note}
              song={""}
              likes={randomIntFromInterval(100, 2000)}
              saves={randomIntFromInterval(0, 100)}
              comments={randomIntFromInterval(0, 100)}
              shares={randomIntFromInterval(0, 100)}
              url={submission.mediaURL}
              profilePic={submission.team.emoji}
              setVideoRef={handleVideoRef(index)}
              autoplay={index === 0}
              suppressHydrationWarning
            />
          ))}
          <BottomNavbar />
        </div>
      </div>
    </div>
  );
}
