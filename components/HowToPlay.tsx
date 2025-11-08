import { Box, Container, Heading, Text, VStack } from "@chakra-ui/react"
import Image from "next/image"
import sfBg from "/public/sf_bg.webp"

export default ({ scavengerHuntName }: { scavengerHuntName: string }) => {
    return (
        <Box
            position="relative"
            minHeight="100%"
            width="100%"
        >
            {/* Background Image */}
            <Box
                position="absolute"
                top={0}
                left={0}
                width="100%"
                height="100%"
                zIndex={0}
                overflow="hidden"
            >
                <Image
                    src={sfBg}
                    alt="San Francisco background"
                    fill
                    sizes="100vw"
                    style={{ 
                        objectFit: 'cover', 
                        objectPosition: 'center',
                    }}
                    placeholder="blur"
                />
            </Box>

            {/* Main content */}
            <Container
                maxW="container.lg"
                position="relative"
                zIndex={2}
                py={8}
            >
                <VStack
                    spacing={6}
                    color="black"
                    width="100%"
                >
                    {/* Title */}
                    <Box
                        bg="whiteAlpha.800"
                        backdropFilter="blur(16px)"
                        borderRadius="2xl"
                        px={{ base: 8, md: 12 }}
                        py={{ base: 6, md: 8 }}
                        boxShadow="2xl"
                        width="100%"
                    >
                        <Heading
                            as="h1"
                            fontSize={{ base: "3xl", md: "4xl", lg: "5xl" }}
                            fontWeight="700"
                            textAlign="center"
                        >
                            How to Play {scavengerHuntName}
                        </Heading>
                    </Box>

                    {/* Challenges Section */}
                    <Box
                        bg="whiteAlpha.800"
                        backdropFilter="blur(16px)"
                        borderRadius="2xl"
                        px={{ base: 6, md: 10 }}
                        py={{ base: 6, md: 8 }}
                        boxShadow="2xl"
                        width="100%"
                    >
                        <Heading as="h2" size="xl" mb={4} fontWeight="600">
                            Challenges
                        </Heading>
                        <Text fontSize={{ base: "md", md: "lg" }} lineHeight="tall">
                            • We've spread 75+ challenges across the city
                            <br /><br />
                            • It's a choose your own adventure! You decide where you go and in what order
                            <br /><br />
                            • Each challenge is worth points and can be done by a limited number of teams
                            <br /><br />
                            • Use the map to see which challenges are nearby! Challenges in the "water" don't have a set location
                            <br /><br />
                            • Some challenges might require you to find a member of HQ (Aivant, Drew, Grace, Sevy). You can find their locations on the map!
                        </Text>
                    </Box>

                    {/* Submissions Section */}
                    <Box
                        bg="whiteAlpha.800"
                        backdropFilter="blur(16px)"
                        borderRadius="2xl"
                        px={{ base: 6, md: 10 }}
                        py={{ base: 6, md: 8 }}
                        boxShadow="2xl"
                        width="100%"
                    >
                        <Heading as="h2" size="xl" mb={4} fontWeight="600">
                            Submissions
                        </Heading>
                        <Text fontSize={{ base: "md", md: "lg" }} lineHeight="tall">
                            • Please take a fun and whimsical video for every challenge submission — bring out your inner content creator!
                            <br /><br />
                            • Submissions will show up on Scavtok and the homepage, so have fun with it! The more creative the better. Also vertical videos are preferred!
                            <br /><br />
                            • If you have trouble uploading your video, you can skip the upload and try again after, or send it to your point of contact instead!
                            <br /><br />
                            • We may put together a highlight reel of the best submissions at the end of the hunt! If you'd prefer for videos of you to not be included, let us know.
                            <br /><br />
                            • All submissions have to be approved by HQ before they count!
                        </Text>
                    </Box>

                    {/* Other Notes Section */}
                    <Box
                        bg="whiteAlpha.800"
                        backdropFilter="blur(16px)"
                        borderRadius="2xl"
                        px={{ base: 6, md: 10 }}
                        py={{ base: 6, md: 8 }}
                        boxShadow="2xl"
                        width="100%"
                    >
                        <Heading as="h2" size="xl" mb={4} fontWeight="600">
                            Other Notes
                        </Heading>
                        <Text fontSize={{ base: "md", md: "lg" }} lineHeight="tall">
                            • Your team must stick together
                            <br /><br />
                            • You can only travel via public transit or on foot. Bikes and scooters are not allowed!
                            <br />
                            (We recommend getting a MUNI day pass)
                            <br /><br />
                            • You can see every team's latest location on the map! The site will ask for location permissions.
                            <br /><br />
                            • Check out the new features that our intern built: ScavAI and Chat! Have fun with them (and obviously, be respectful!)
                        </Text>
                    </Box>

                    {/* Prize Categories Section */}
                    <Box
                        bg="whiteAlpha.800"
                        backdropFilter="blur(16px)"
                        borderRadius="2xl"
                        px={{ base: 6, md: 10 }}
                        py={{ base: 6, md: 8 }}
                        boxShadow="2xl"
                        width="100%"
                    >
                        <Heading as="h2" size="xl" mb={4} fontWeight="600">
                            Prize Categories
                        </Heading>
                        <Text fontSize={{ base: "md", md: "lg" }} lineHeight="tall">
                            • Most points (1st, 2nd, and 3rd place)
                            <br /><br />
                            • Most committed to the bit for a challenge (several winners)
                            <br /><br />
                            • Funniest challenge submission (several winners)
                            <br /><br />
                            • Best team vibes (several winners)
                            <br /><br />
                            • Potentially more!
                            <br /><br />
                            The prize? Eternal glory in the scavhunt hall of fame — and maybe something more...
                        </Text>
                    </Box>

                    {/* Closing */}
                    <Box
                        bg="whiteAlpha.800"
                        backdropFilter="blur(16px)"
                        borderRadius="2xl"
                        px={{ base: 6, md: 10 }}
                        py={{ base: 6, md: 8 }}
                        boxShadow="2xl"
                        width="100%"
                    >
                        <Heading as="h3" size="lg" mb={4} fontWeight="600" textAlign="center">
                            That's All!
                        </Heading>
                        <Text fontSize={{ base: "md", md: "lg" }} lineHeight="tall" textAlign="center">
                            Remember: have fun, wear sunscreen, and take whimsical, vertical videos!!!
                            <br /><br />
                            We'll see you at closing ceremonies at 6pm in Alamo Square 🧺
                        </Text>
                    </Box>

                    {/* Footer */}
                    <Box
                        bg="whiteAlpha.800"
                        backdropFilter="blur(16px)"
                        borderRadius="2xl"
                        px={{ base: 6, md: 10 }}
                        py={{ base: 2, md: 2 }}
                        boxShadow="2xl"
                    >
                    <Text fontSize="sm" color="gray.700" textAlign="center">
                        This website is not SOC2 compliant.
                        <br />
                        For inquiries, please reach out to any housemate or Sevy.
                    </Text>
                    </Box>
                </VStack>
            </Container>
        </Box>
    )
}
