import React from "react";

export default function FooterLeft(props) {
  const { username, description } = props;

  return (
    <div className="footer-container">
      <div className="footer-left">
        <div className="text">
          <h3>@{username}</h3>
          <p>{description}</p>
        </div>
      </div>
    </div>
  );
}
