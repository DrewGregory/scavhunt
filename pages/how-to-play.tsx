import dynamic from "next/dynamic";
import NavContainer from "../components/NavContainer";
import { InferGetServerSidePropsType } from "next";

export const getServerSideProps = async () => {
  const scavengerHuntName = process.env.SCAVENGER_HUNT_NAME || "Scavenger Hunt";
  
  return {
    props: {
      scavengerHuntName,
    }
  }
};


const HowToPlay = dynamic(() => import("../components/HowToPlay"), {
  ssr: false
});

export default function Page({
  scavengerHuntName,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return <NavContainer title="how to play" fullScreen bgColor="transparent" hideTopBar><HowToPlay scavengerHuntName={scavengerHuntName}/></NavContainer>
}
