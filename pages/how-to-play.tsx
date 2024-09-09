import dynamic from "next/dynamic";
import NavContainer from "../components/NavContainer";
import { InferGetServerSidePropsType } from "next";
import { getStartTime } from "../lib/time";
import { formatISO, parseISO } from "date-fns";

export const getServerSideProps = async () => {
  const startTime = getStartTime();
  return {
    props: {
      startTimeISO: formatISO(startTime),
    }
  }
};


const HowToPlay = dynamic(() => import("../components/HowToPlay"), {
  ssr: false
});

export default function Page({
  startTimeISO
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return <NavContainer title="how to play" fullScreen bgColor="#c79fb8" hgt="70dvh"><HowToPlay startTime={parseISO(startTimeISO)}/></NavContainer>
}
