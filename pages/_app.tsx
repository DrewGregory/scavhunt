import "./global.css";
import "./foryou.css";
import "./components/FooterLeft.css";
import "./components/FooterRight.css";
import "./components/VideoCard.css";
import type { AppProps } from "next/app";
import { ChakraProvider } from "@chakra-ui/react";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ChakraProvider>
      <Component {...pageProps} />
    </ChakraProvider>
  );
}
