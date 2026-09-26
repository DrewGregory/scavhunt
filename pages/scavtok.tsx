import { GetServerSidePropsContext, InferGetServerSidePropsType } from "next";
import { useEffect, useRef } from "react";
import { prisma } from "../lib/prisma";
import { requireUserSSP } from "../lib/auth";
import { requireHuntStartedSSP } from "../lib/time";
import {
  serializeChallenge,
  serializeSubmission,
  serializeTeam,
} from "../lib/serialize";
import VideoCard from "./components/VideoCard";
import BottomNavbar from "./components/BottomNavbar";
import TopNavbar from "./components/TopNavbar";

export const getServerSideProps = async (
  context: GetServerSidePropsContext,
) => {
  const auth = await requireUserSSP(context);
  if (auth.redirect) return { redirect: auth.redirect };

  const huntRedirect = await requireHuntStartedSSP(auth.user.isAdmin);
  if (huntRedirect) return { redirect: huntRedirect };

  const submissionsRaw = await prisma.submission.findMany({
    where: {
      deletedAt: null,
      team: { deletedAt: null },
      challenge: { deletedAt: null, enabled: true },
    },
    orderBy: { createdAt: "desc" },
    include: {
      team: true,
      challenge: true,
    },
  });

  const submissions = submissionsRaw.map((s) => ({
    ...serializeSubmission(s),
    team: serializeTeam(s.team),
    challenge: serializeChallenge(s.challenge),
  }));

  return {
    props: {
      submissions,
    },
  };
};

export default function Page({
  submissions,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const videoRefs = useRef<any>([]);

  useEffect(() => {
    const observerOptions = {
      root: null,
      rootMargin: "0px",
      threshold: 0.8,
    };

    const handleIntersection = (entries: any) => {
      entries.forEach((entry: any) => {
        if (entry.isIntersecting) {
          entry.target.play();
        } else {
          entry.target.pause();
        }
      });
    };

    const observer = new IntersectionObserver(
      handleIntersection,
      observerOptions,
    );

    videoRefs.current.forEach((videoRef: any) => {
      if (videoRef) observer.observe(videoRef);
    });

    return () => {
      observer.disconnect();
    };
  }, [submissions]);

  const handleVideoRef = (index: any) => (ref: any) => {
    videoRefs.current[index] = ref;
  };

  const submissionsWithVideos = submissions.filter(
    (submission) =>
      submission.mediaURL &&
      submission.mediaURL
        .toLowerCase()
        .match(/\.(mpg|mp2|mpeg|mpe|mpv|mov|mp4|webm)$/i),
  );

  const randomIntFromInterval = (min: number, max: number) => {
    return Math.floor(Math.random() * (max - min + 1) + min);
  };

  return (
    <div className="scavtok" suppressHydrationWarning>
      <div className="app">
        <div className="container">
          <TopNavbar />
          {submissionsWithVideos.map((submission, index) => (
            <VideoCard
              key={submission.id}
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
