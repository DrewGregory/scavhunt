import "./global.css";
import "./foryou.css";
import "./components/FooterLeft.css";
import "./components/FooterRight.css";
import "./components/VideoCard.css";
import type { AppProps } from "next/app";
import { ChakraProvider, extendTheme } from "@chakra-ui/react";
import { Manrope } from "next/font/google";

const manrope = Manrope({ subsets: ["latin"], display: "swap" });

const theme = extendTheme({
  fonts: {
    heading: manrope.style.fontFamily,
    body: manrope.style.fontFamily,
  },
});

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ChakraProvider theme={theme}>
      <Component {...pageProps} />
    </ChakraProvider>
  );
}
