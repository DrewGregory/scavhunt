import { GetServerSidePropsContext } from "next";

/** Legacy /map → unified challenges map view. */
export const getServerSideProps = async (
  context: GetServerSidePropsContext,
) => {
  const challenge =
    typeof context.query.challenge === "string"
      ? context.query.challenge
      : null;
  const qs = new URLSearchParams({ view: "map" });
  if (challenge) qs.set("challenge", challenge);
  return {
    redirect: {
      destination: `/challenges?${qs.toString()}`,
      permanent: false,
    },
  };
};

export default function MapRedirectPage() {
  return null;
}
