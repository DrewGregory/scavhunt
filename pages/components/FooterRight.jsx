import React, { useState } from "react";
import { useRouter } from "next/router";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCirclePlus,
  faCircleCheck,
  faHeart,
  faCommentDots,
  faBookmark,
  faShare,
} from "@fortawesome/free-solid-svg-icons";
// import './FooterRight.css';
import { Text } from "@chakra-ui/react";

function FooterRight({
  likes,
  comments,
  saves,
  shares,
  profilePic,
  onCommentClick,
  submissionId,
  onLikeUpdate,
}) {
  const router = useRouter();
  const [isLiking, setIsLiking] = useState(false);
  const [saved, setSaved] = useState(false);
  const [userAddIcon, setUserAddIcon] = useState(faCirclePlus);

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
      <div className="sidebar-icon">
        {/* The heart icon for liking */}
        <FontAwesomeIcon
          icon={faHeart}
          style={{
            width: "35px",
            height: "35px",
            color: "white",
            opacity: isLiking ? 0.5 : 1,
          }}
          onClick={handleLikeClick}
        />
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
      <div className="sidebar-icon">
        {saved ? (
          // Displaying the bookmark icon when saved
          <FontAwesomeIcon
            icon={faBookmark}
            style={{ width: "35px", height: "35px", color: "#ffc107" }}
            onClick={() => setSaved(false)}
          />
        ) : (
          // Displaying the bookmark icon when not saved
          <FontAwesomeIcon
            icon={faBookmark}
            style={{ width: "35px", height: "35px", color: "white" }}
            onClick={() => setSaved(true)}
          />
        )}
        {/* Displaying the number of saves */}
        <p suppressHydrationWarning>{saved ? saves + 1 : saves}</p>
      </div>
      <div className="sidebar-icon">
        {/* The share icon */}
        <FontAwesomeIcon
          icon={faShare}
          style={{ width: "35px", height: "35px", color: "white" }}
        />
        {/* Displaying the number of shares */}
        <p suppressHydrationWarning>{shares}</p>
      </div>
      <div className="sidebar-icon record">
        {/* Displaying the record icon */}
        <img
          src="https://static.thenounproject.com/png/934821-200.png"
          alt="Record Icon"
        />
      </div>
    </div>
  );
}

export default FooterRight;
