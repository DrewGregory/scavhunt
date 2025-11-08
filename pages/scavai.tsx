import NavContainer from "../components/NavContainer";
import { GetServerSidePropsContext, InferGetServerSidePropsType } from "next";
import { getTeamFromCookie } from "../lib/team";
import { useState, useRef, useEffect } from "react";
import {
  Box,
  VStack,
  HStack,
  Input,
  Button,
  Text,
  Card,
  Flex,
  Spinner,
} from "@chakra-ui/react";
import { FaMagic } from "react-icons/fa";
import ReactMarkdown from "react-markdown";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export const getServerSideProps = async (
  context: GetServerSidePropsContext
) => {
  const teamRaw = await getTeamFromCookie(context.req.cookies);

  if (teamRaw == null) {
    return {
      redirect: {
        destination: "/",
        permanent: false,
      },
    };
  }

  return {
    props: {},
  };
};

export default function ScavAI({}: InferGetServerSidePropsType<
  typeof getServerSideProps
>) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Hello! I'm ScavAI, your scavenger hunt assistant. I can help you with information about challenges, finding the ideal route, and answer any questions you have about the hunt. How can I help you today?",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/scavai-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: input,
          history: messages,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to get response");
      }

      const data = await response.json();

      // Check if we got an error or empty response
      if (data.error || !data.response || data.response.trim() === "") {
        const errorMessage: Message = {
          role: "assistant",
          content:
            data.error ||
            "Sorry, I received an empty response. Please try asking in a different way.",
        };
        setMessages((prev) => [...prev, errorMessage]);
      } else {
        const assistantMessage: Message = {
          role: "assistant",
          content: data.response,
        };
        setMessages((prev) => [...prev, assistantMessage]);
      }
    } catch (error) {
      console.error("Error:", error);
      const errorMessage: Message = {
        role: "assistant",
        content: "Sorry, I encountered an error. Please try again.",
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <NavContainer title="ScavAI">
      <VStack spacing={4} align="stretch" pb="0">
        {messages.map((message, index) => (
          <Card
            key={index}
            p={4}
            bg={message.role === "user" ? "blue.50" : "green.50"}
            alignSelf={message.role === "user" ? "flex-end" : "flex-start"}
            maxW="80%"
          >
            <HStack spacing={2} mb={2}>
              {message.role === "assistant" && <FaMagic />}
              <Text fontWeight="bold">
                {message.role === "user" ? "You" : "ScavAI"}
              </Text>
            </HStack>
            {message.role === "user" ? (
              <Text whiteSpace="pre-wrap">{message.content}</Text>
            ) : (
              <Box
                sx={{
                  "& p": { mb: 2 },
                  "& ul, & ol": { ml: 4, mb: 2 },
                  "& li": { mb: 1 },
                  "& code": {
                    bg: "gray.100",
                    px: 1,
                    py: 0.5,
                    borderRadius: "md",
                    fontSize: "sm",
                  },
                  "& pre": {
                    bg: "gray.100",
                    p: 2,
                    borderRadius: "md",
                    overflowX: "auto",
                    mb: 2,
                  },
                  "& h1, & h2, & h3": { fontWeight: "bold", mb: 2 },
                  "& strong": { fontWeight: "bold" },
                  "& em": { fontStyle: "italic" },
                }}
              >
                <ReactMarkdown>{message.content}</ReactMarkdown>
              </Box>
            )}
          </Card>
        ))}
        {isLoading && (
          <Card p={4} bg="green.50" alignSelf="flex-start" maxW="80%">
            <HStack spacing={2}>
              <Spinner size="sm" />
              <Text>ScavAI is thinking...</Text>
            </HStack>
          </Card>
        )}
        <div ref={messagesEndRef} />
      </VStack>
      <Box
        position="fixed"
        bottom={{ base: 0, md: 4 }}
        left={{ base: 0, md: "20vw" }}
        right={0}
        width={{ base: "100vw", md: "80vw" }}
        bg="white"
        p={4}
        borderTop="1px solid"
        borderColor="gray.200"
        zIndex={10}
      >
        <HStack>
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask me anything about the scavenger hunt..."
            disabled={isLoading}
          />
          <Button
            onClick={handleSend}
            colorScheme="green"
            isLoading={isLoading}
            disabled={!input.trim()}
          >
            Send
          </Button>
        </HStack>
      </Box>
    </NavContainer>
  );
}
