import dynamic from "next/dynamic";
import NavContainer from "../components/NavContainer";
import { InferGetServerSidePropsType } from "next";
import { getStartTime } from "../lib/time";
import { formatISO, parseISO } from "date-fns";
import HowToPlayV2 from "../components/HowToPlayV2";

export const getServerSideProps = async () => {
  const startTime = getStartTime();
  const scavengerHuntName = process.env.SCAVENGER_HUNT_NAME || "Scavenger Hunt";
  const showHowToPlay = process.env.SHOW_HOW_TO_PLAY === 'true';
  
  return {
    props: {
      startTimeISO: formatISO(startTime),
      scavengerHuntName,
      showHowToPlay,
    }
  }
};


const HowToPlay = dynamic(() => import("../components/HowToPlay"), {
  ssr: false
});

export default function Page({
  startTimeISO,
  scavengerHuntName,
  showHowToPlay,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return <NavContainer title="how to play" fullScreen bgColor="#c79fb8" hgt="70dvh"><HowToPlayV2 startTime={parseISO(startTimeISO)} scavengerHuntName={scavengerHuntName} showHowToPlay={showHowToPlay}/></NavContainer>
}
