import { Spinner } from "@chakra-ui/spinner";
import { GetServerSideProps } from "next";
import React from "react";
import { dbConnect } from "../../lib/dbConnect";
import { TEAM_COOKIE_NAME } from "../../lib/team";
import { serialize } from "cookie";

export const getServerSideProps : GetServerSideProps = async(context) => {
  await dbConnect();
  const { query, res } = context;
  const { teamCode } = query;
  if (typeof teamCode === "string") {
    const cookie = serialize(TEAM_COOKIE_NAME, teamCode, {
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 7, // One week
      path: '/',
      sameSite: "strict",
    });
    res.setHeader('Set-Cookie', cookie)
  }
  return {
    redirect: {
      destination: "/",
      permanent: true,
    }
  }
}

export default function Page() {
  return <Spinner />
}