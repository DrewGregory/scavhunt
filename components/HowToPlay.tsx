import { Box, Divider, Heading, Text, VStack } from "@chakra-ui/react"
import Image from "next/image"
import { useEffect, useState } from "react"
import '@fontsource/press-start-2p'
import Countdown from "react-countdown"


const images = {
    daytime: {
        src: "/sf_day.gif",
        alt: "foggy golden gate pixel art. src: https://www.reddit.com/r/PixelArt/comments/vw2yxc/san_francisco_summer/",
        backgroundColor: "#5d9dff",
        width: 1024,
        height: 1024,
        justifyContent: 'flex-start'
    },
    evening: {
        src: "/sf_evening.png",
        alt: "dusk sf city pixel art. src: https://www.reddit.com/r/PixelArt/comments/9g8pai/san_francisco_skyline/",
        backgroundColor: "#c79fb8",
        width: 1500,
        height: 400,
        justifyContent: "flex-start"
    },
    cloud: {
        src: "/cloud.png",
        alt: "cloud pixel art. src: https://dinopixel.com/cloud-pixel-art-20817",
        width: 226,
        height: 90,
    },
}


export default ({ startTime} : {startTime: Date; }) => {
    const [imageKey, setImageKey] = useState<'evening' | 'daytime'>('evening');
    useEffect(() => {
        const updateImage = () => {
            const hour = new Date().getHours();
            const isMobile = window.matchMedia("(max-width: 768px)").matches;
            if (isMobile && hour < 19 && hour > 6) {
                setImageKey('daytime');
            } else {
                setImageKey('evening');
            }
        };

        updateImage();

        window.addEventListener("resize", updateImage);
        return () => window.removeEventListener("resize", updateImage);
    }, []);
    const image = images[imageKey];

    return (
        <Box backgroundColor={image.backgroundColor} height="100%" display="flex" flexDirection="column">
            <Box
                position="fixed"
                bottom={0}
                left={0}
                width="100%"
                zIndex={2}
            >
                <Image layout="responsive" {...image} />
            </Box>


            {/* Main content */}
            <VStack
                flex={1}
                direction="column"
                alignItems="center"
                color="black"
                px={6}
                paddingTop="60px"
                paddingBottom={{ base: "150px", md: "50vh" }}
                height="100%"  // Make sure the VStack takes up all available space
                spacing={4}
                textAlign="center"
            >
                <Heading fontFamily="'Press Start 2P'" size="md" >Scavenger hunt</Heading>
                <Divider borderColor="gray" />
                <Countdown date={startTime} renderer={CountdownRenderer} />
                <Divider borderColor="gray" />
                <Heading fontFamily="'Press Start 2P'" size="md" my={2} >how to play</Heading>
                <Heading fontFamily="'Press Start 2P'" size="sm" >Challenges</Heading>
                <Text fontSize="10" fontFamily="'Press Start 2P'">
                    - we've spread 75+ challenges across the city<br /><br />
                    - it's a choose your own adventure! You decide where you go and in what order<br /><br />
                    - each challenge is worth points and can be done by a limited number of teams.<br /><br />
                    - use the map to see which challenges are nearby! Challenges in the "water" don't have a set location. <br /><br />
                </Text>
                <Heading fontFamily="'Press Start 2P'" size="sm" >submissions</Heading>
                <Text fontSize="10" fontFamily="'Press Start 2P'">
                    - you'll upload a video for every challenge submission. Please submit VERTICAL videos if possible!!<br /><br />
                    - if your video is longer than a minute or you have trouble uploading, send it to one of us separately instead!<br /><br />
                    - you can see everyone's submissions on the homepage!<br /><br />
                </Text>
                <Heading fontFamily="'Press Start 2P'" size="sm">other notes</Heading>
                <Text fontSize="10" fontFamily="'Press Start 2P'">
                    - your team must stick together<br /><br />
                    - you can only travel via public transit, bikes, scooters, or on foot!<br />(We recommend getting a MUNI day pass)<br /><br />
                    - you can see every teams' latest location on the map! the site will ask for location permissions <br /><br />
                </Text>
                <Heading fontFamily="'Press Start 2P'" size="sm">prize categories</Heading>
                <Text fontSize="10" fontFamily="'Press Start 2P'">
                    - most points (1st and 2nd place)<br /><br />
                    - most committed to the bit for a challenge<br /><br />
                    - funniest challenge submission<br /><br />
                    - best team vibes<br /><br />
                    - potentially more!<br /><br />Contribute ideas or 💸 to the prize pool to help :))<br /><br /><br />
                </Text>
                <Heading fontFamily="'Press Start 2P'" size="xs" >that's all!</Heading>
                <Text fontFamily="'Press Start 2P'" fontSize="12">
                    remember: have fun, wear sunscreen, and take vertical videos!!!<br /><br />
                    we'll see you at closing ceremonies at 6pm in Alamo Square 🧺
                </Text>
                <Text fontFamily="'Press Start 2P'" fontSize="7">
                    <br /> this website is not soc2 compliant.<br /><br />for inquiries, please reach out to any housemate<br />
                </Text>
            </VStack>
        </Box>
    )

}

const CountdownRenderer = ({ days, hours, minutes, seconds, completed }: { days: number, hours: number, minutes: number, seconds: number, completed: boolean }) => {
    return completed ?
        (<VStack>
            <Heading fontFamily="'Press Start 2P'" mb={4} size="md">let the games begin!</Heading>
            <Heading fontFamily="'Press Start 2P'" size="xs">reach out to drew or aivant for your login link</Heading>
        </VStack >)
        : (
            <VStack>
                <Heading fontFamily="'Press Start 2P'" size="sm">{days} {days === 1 ? 'day' : 'days'}</Heading>
                <Heading fontFamily="'Press Start 2P'" size="sm">{hours} {hours === 1 ? 'hour' : 'hours'}</Heading>
                <Heading fontFamily="'Press Start 2P'" size="sm">{minutes} {minutes === 1 ? 'minute' : 'minutes'}</Heading>
                <Heading fontFamily="'Press Start 2P'" size="sm">{seconds} {seconds === 1 ? 'second' : 'seconds'}</Heading>
            </VStack>
        )
}