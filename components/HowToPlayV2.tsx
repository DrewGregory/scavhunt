import { Box, Container, Divider, Heading, Text, VStack } from "@chakra-ui/react"
import { useEffect, useState } from "react"
import Countdown from "react-countdown"
import Image from "next/image"


export default ({ startTime, scavengerHuntName, showHowToPlay }: { startTime: Date; scavengerHuntName: string; showHowToPlay: boolean }) => {
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
        setIsClient(true);
    }, []);

    return (
        <Box
            position="relative"
            minHeight="100vh"
            width="100%"
            overflow="auto"
        >
            {/* Background Image */}
            <Box
                position="fixed"
                top={0}
                left={0}
                width="100%"
                height="100%"
                zIndex={0}
                overflow="hidden"
            >
                <Image
                    src="/sf_bg.jpeg"
                    alt="San Francisco background"
                    fill
                    sizes="100vw"
                    style={{ objectFit: 'cover', objectPosition: 'center' }}
                    priority
                    quality={100}
                />
            </Box>

            {/* Main content */}
            <Container
                maxW="container.lg"
                position="relative"
                zIndex={2}
                minHeight="100vh"
                display="flex"
                alignItems={{ base: "flex-start", md: "flex-end" }}
                justifyContent="center"
                pt={{ base: "3vh", sm: "3vh", md: "0" }}
                pb={{ base: "0", md: "10vh", lg: "10vh" }}
            >
                <VStack
                    spacing={8}
                    alignItems="center"
                    color="white"
                    textAlign="center"
                    width="100%"
                >
                    {/* Title and Countdown with glassmorphism */}
                    <Box
                        bg="whiteAlpha.200"
                        backdropFilter="blur(8px)"
                        borderRadius="2xl"
                        px={{ base: 6, sm: 8, md: 12 }}
                        py={{ base: 6, sm: 7, md: 8 }}
                        boxShadow="xl"
                    >
                        <VStack spacing={3}>
                            <Heading
                                as="h1"
                                fontSize={{ base: "2xl", sm: "3xl", md: "4xl", lg: "5xl" }}
                                fontWeight="700"
                                letterSpacing="tight"
                            >
                                {scavengerHuntName}
                            </Heading>

                            <Divider borderColor="whiteAlpha.500" width="60%" />

                            {isClient && (
                                <Countdown date={startTime} renderer={CountdownRenderer} />
                            )}
                        </VStack>
                    </Box>

                    {/* How to Play section - controlled by prop */}
                    {showHowToPlay && (
                        <>
                            <Heading
                                as="h2"
                                size="xl"
                                fontWeight="600"
                                mt={4}
                            >
                                How to Play
                            </Heading>

                            {/* Challenges Section */}
                            <Box width="100%">
                                <Heading as="h3" size="lg" mb={4} fontWeight="600">
                                    Challenges
                                </Heading>
                                <Text fontSize="md" lineHeight="tall" textAlign="left">
                                    • We've spread 75+ challenges across the city
                                    <br /><br />
                                    • It's a choose your own adventure! You decide where you go and in what order
                                    <br /><br />
                                    • Each challenge is worth points and can be done by a limited number of teams
                                    <br /><br />
                                    • Use the map to see which challenges are nearby! Challenges in the "water" don't have a set location
                                </Text>
                            </Box>

                            {/* Submissions Section */}
                            <Box width="100%">
                                <Heading as="h3" size="lg" mb={4} fontWeight="600">
                                    Submissions
                                </Heading>
                                <Text fontSize="md" lineHeight="tall" textAlign="left">
                                    • You'll upload a video for every challenge submission. Please submit VERTICAL videos if possible!!
                                    <br /><br />
                                    • If your video is longer than a minute or you have trouble uploading, send it to one of us separately instead!
                                    <br /><br />
                                    • You can see everyone's submissions on the homepage!
                                </Text>
                            </Box>

                            {/* Other Notes Section */}
                            <Box width="100%">
                                <Heading as="h3" size="lg" mb={4} fontWeight="600">
                                    Other Notes
                                </Heading>
                                <Text fontSize="md" lineHeight="tall" textAlign="left">
                                    • Your team must stick together
                                    <br /><br />
                                    • You can only travel via public transit, bikes, scooters, or on foot!
                                    <br />
                                    (We recommend getting a MUNI day pass)
                                    <br /><br />
                                    • You can see every team's latest location on the map! The site will ask for location permissions
                                </Text>
                            </Box>

                            {/* Prize Categories Section */}
                            <Box width="100%">
                                <Heading as="h3" size="lg" mb={4} fontWeight="600">
                                    Prize Categories
                                </Heading>
                                <Text fontSize="md" lineHeight="tall" textAlign="left">
                                    • Most points (1st and 2nd place)
                                    <br /><br />
                                    • Most committed to the bit for a challenge
                                    <br /><br />
                                    • Funniest challenge submission
                                    <br /><br />
                                    • Best team vibes
                                    <br /><br />
                                    • Potentially more!
                                    <br /><br />
                                    Contribute ideas or 💸 to the prize pool to help :))
                                </Text>
                            </Box>

                            {/* Closing */}
                            <Box mt={6}>
                                <Heading as="h4" size="md" mb={3} fontWeight="600">
                                    That's All!
                                </Heading>
                                <Text fontSize="lg" lineHeight="tall">
                                    Remember: have fun, wear sunscreen, and take vertical videos!!!
                                    <br /><br />
                                    We'll see you at closing ceremonies at 6pm in Alamo Square 🧺
                                </Text>
                            </Box>

                            {/* Footer */}
                            <Text fontSize="xs" color="whiteAlpha.700" mt={4} mb={8}>
                                This website is not SOC2 compliant.
                                <br />
                                For inquiries, please reach out to any housemate
                            </Text>
                        </>
                    )}
                </VStack>
            </Container>
        </Box>
    )
}

const CountdownRenderer = ({
    days,
    hours,
    minutes,
    seconds,
    completed
}: {
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    completed: boolean;
}) => {
    return completed ? (
        <VStack spacing={4}>
            <Heading
                as="h2"
                size="2xl"
                fontWeight="700"
                color="white"
                textShadow="0 0 20px rgba(255,255,255,0.5)"
            >
                Let the Games Begin!
            </Heading>
            <Text fontSize="xl" fontWeight="500" color="white">
                Reach out to Drew or Aivant for your login link
            </Text>
        </VStack>
    ) : (
        <Box display="flex" gap={{ base: 3, sm: 4, md: 6 }} flexWrap="wrap" justifyContent="center">
            <VStack spacing={1}>
                <Text fontSize={{ base: "3xl", sm: "4xl", md: "5xl" }} fontWeight="800" lineHeight="1" color="white">
                    {days}
                </Text>
                <Text fontSize={{ base: "xs", sm: "sm", md: "md" }} fontWeight="600" color="white" textTransform="uppercase" letterSpacing="wide">
                    {days === 1 ? "Day" : "Days"}
                </Text>
            </VStack>

            <VStack spacing={1}>
                <Text fontSize={{ base: "3xl", sm: "4xl", md: "5xl" }} fontWeight="800" lineHeight="1" color="white">
                    {hours}
                </Text>
                <Text fontSize={{ base: "xs", sm: "sm", md: "md" }} fontWeight="600" color="white" textTransform="uppercase" letterSpacing="wide">
                    {hours === 1 ? "Hour" : "Hours"}
                </Text>
            </VStack>

            <VStack spacing={1}>
                <Text fontSize={{ base: "3xl", sm: "4xl", md: "5xl" }} fontWeight="800" lineHeight="1" color="white">
                    {minutes}
                </Text>
                <Text fontSize={{ base: "xs", sm: "sm", md: "md" }} fontWeight="600" color="white" textTransform="uppercase" letterSpacing="wide">
                    {minutes === 1 ? "Minute" : "Minutes"}
                </Text>
            </VStack>

            <VStack spacing={1}>
                <Text fontSize={{ base: "3xl", sm: "4xl", md: "5xl" }} fontWeight="800" lineHeight="1" color="white">
                    {seconds}
                </Text>
                <Text fontSize={{ base: "xs", sm: "sm", md: "md" }} fontWeight="600" color="white" textTransform="uppercase" letterSpacing="wide">
                    {seconds === 1 ? "Second" : "Seconds"}
                </Text>
            </VStack>
        </Box>
    );
};

