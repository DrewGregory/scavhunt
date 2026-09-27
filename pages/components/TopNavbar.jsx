import React from "react";

/**
 * ScavTok top tabs.
 * For You = your team only; Following = everyone.
 */
const TopNavbar = ({ tab = "following", onTabChange, forYouDisabled = false }) => {
  return (
    <div className="top-navbar">
      <h2>
        <button
          type="button"
          className={tab === "following" ? "tab active" : "tab"}
          onClick={() => onTabChange?.("following")}
        >
          Following
        </button>
        <span className="tab-sep"> | </span>
        <button
          type="button"
          className={tab === "foryou" ? "tab active" : "tab"}
          disabled={forYouDisabled}
          onClick={() => {
            if (!forYouDisabled) onTabChange?.("foryou");
          }}
        >
          For You
        </button>
      </h2>
    </div>
  );
};

export default TopNavbar;
