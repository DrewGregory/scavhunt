import { GetServerSidePropsContext } from "next";

/** Legacy /scavtok → unified feed tok view. */
export const getServerSideProps = async (
  context: GetServerSidePropsContext,
) => {
  const submission =
    typeof context.query.submission === "string"
      ? context.query.submission
      : null;
  const qs = new URLSearchParams({ view: "tok" });
  if (submission) qs.set("submission", submission);
  return {
    redirect: {
      destination: `/feed?${qs.toString()}`,
      permanent: false,
    },
  };
};

export default function ScavTokRedirectPage() {
  return null;
}
