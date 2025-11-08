import React, { useState } from "react";
import { useRouter } from "next/router";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCirclePlus,
  faCircleCheck,
  faHeart,
  faCommentDots,
} from "@fortawesome/free-solid-svg-icons";
import { Text } from "@chakra-ui/react";

function FooterRight({
  likes,
  comments,
  profilePic,
  onCommentClick,
  submissionId,
  onLikeUpdate,
}) {
  const router = useRouter();
  const [liked, setLiked] = useState(false);
  const [isLiking, setIsLiking] = useState(false);
  const [userAddIcon, setUserAddIcon] = useState(faCirclePlus);
  const [flyingHearts, setFlyingHearts] = useState([]);

  const handleUserAddClick = () => {
    setUserAddIcon(faCircleCheck);
    setTimeout(() => {
      setUserAddIcon(null);
    }, 3000); // Change the delay time (in milliseconds) as needed
  };

  // Function to convert likes count to a number
  const parseLikesCount = (count) => {
    if (typeof count === "string") {
      if (count.endsWith("K")) {
        return parseFloat(count) * 1000;
      }
      return parseInt(count);
    }
    return count;
  };

  // Function to format likes count
  const formatLikesCount = (count) => {
    if (count >= 10000) {
      return (count / 1000).toFixed(1) + "K";
    }
    return count;
  };

  const handleLikeClick = async () => {
    if (isLiking) return;

    setIsLiking(true);
    setLiked(true);

    // Add flying heart animation
    const heartId = Date.now() + Math.random();
    setFlyingHearts((prev) => [...prev, heartId]);
    setTimeout(() => {
      setFlyingHearts((prev) => prev.filter((id) => id !== heartId));
    }, 1000);

    try {
      const response = await fetch("/api/likes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          submissionId: submissionId,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (onLikeUpdate) {
          onLikeUpdate(data.likes);
        }
      }
    } catch (error) {
      console.error("Error liking video:", error);
    } finally {
      setIsLiking(false);
    }
  };

  return (
    <>
      <style jsx>{`
        @keyframes flyHeart {
          0% {
            opacity: 1;
            transform: translateX(-50%) translateY(0) scale(1);
          }
          50% {
            opacity: 0.8;
            transform: translateX(-50%) translateY(-60px) scale(1.2);
          }
          100% {
            opacity: 0;
            transform: translateX(-50%) translateY(-100px) scale(0.8);
          }
        }
      `}</style>
      <div className="footer-right">
        <div className="sidebar-icon">
          <Text>{profilePic}</Text>
          {/* The user add icon */}
          <FontAwesomeIcon
            icon={userAddIcon}
            className="useradd"
            style={{ width: "15px", height: "15px", color: "#FF0000" }}
            onClick={handleUserAddClick}
          />
        </div>
        <div className="sidebar-icon" style={{ position: "relative" }}>
          {/* The heart icon for liking */}
          <FontAwesomeIcon
            icon={faHeart}
            style={{
              width: "35px",
              height: "35px",
              color: liked ? "#FF0000" : "white",
              opacity: isLiking ? 0.5 : 1,
            }}
            onClick={handleLikeClick}
          />
          {/* Flying hearts animation */}
          {flyingHearts.map((id) => (
            <FontAwesomeIcon
              key={id}
              icon={faHeart}
              style={{
                position: "absolute",
                width: "20px",
                height: "20px",
                color: "#FF0000",
                left: "50%",
                bottom: "20px",
                transform: "translateX(-50%)",
                animation: "flyHeart 1s ease-out forwards",
                pointerEvents: "none",
              }}
            />
          ))}
          {/* Displaying the formatted likes count */}
          <p suppressHydrationWarning>
            {formatLikesCount(parseLikesCount(likes))}
          </p>
        </div>
        <div
          className="sidebar-icon"
          onClick={onCommentClick || (() => router.push("/chat"))}
          style={{ cursor: "pointer" }}
        >
          {/* The comment icon */}
          <FontAwesomeIcon
            icon={faCommentDots}
            style={{ width: "35px", height: "35px", color: "white" }}
          />
          {/* Displaying the number of comments */}
          <p suppressHydrationWarning>{comments}</p>
        </div>
        <div className="sidebar-icon record">
          {/* Displaying the record icon */}
          <img
            src="https://static.thenounproject.com/png/934821-200.png"
            alt="Record Icon"
          />
        </div>
      </div>
    </>
  );
}

export default FooterRight;
