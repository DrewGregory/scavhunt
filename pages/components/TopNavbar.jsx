import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTv, faSearch, faTimes, faArrowLeft } from '@fortawesome/free-solid-svg-icons';

const TopNavbar = ({ onVideoSelect }) => {
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (searchQuery.trim().length === 0) {
      setSearchResults([]);
      return;
    }

    const debounceTimer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const response = await fetch(`/api/search-submissions?q=${encodeURIComponent(searchQuery)}`);
        if (response.ok) {
          const data = await response.json();
          setSearchResults(data.results || []);
        }
      } catch (error) {
        console.error('Search failed:', error);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(debounceTimer);
  }, [searchQuery]);

  const handleResultClick = (submissionId) => {
    setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);
    if (onVideoSelect) {
      onVideoSelect(submissionId);
    }
  };

  const handleCloseSearch = () => {
    setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  if (showSearch) {
    return (
      <>
        <style jsx>{`
          .search-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: #000;
            z-index: 1000;
            overflow-y: auto;
          }
          .search-header {
            display: flex;
            align-items: center;
            padding: 12px 16px;
            background: #000;
            border-bottom: 1px solid #2f2f2f;
            position: sticky;
            top: 0;
            z-index: 1001;
          }
          .back-button {
            color: #fff;
            font-size: 20px;
            cursor: pointer;
            margin-right: 12px;
            padding: 8px;
          }
          .search-input-container {
            flex: 1;
            position: relative;
            display: flex;
            align-items: center;
            background: #1a1a1a;
            border-radius: 8px;
            padding: 8px 12px;
          }
          .search-input {
            flex: 1;
            background: transparent;
            border: none;
            color: #fff;
            font-size: 16px;
            outline: none;
          }
          .search-input::placeholder {
            color: #666;
          }
          .clear-button {
            color: #666;
            font-size: 16px;
            cursor: pointer;
            padding: 4px;
            margin-left: 8px;
          }
          .search-results {
            padding: 8px 0;
          }
          .search-result-item {
            display: flex;
            align-items: center;
            padding: 12px 16px;
            cursor: pointer;
            border-bottom: 1px solid #2f2f2f;
          }
          .search-result-item:hover {
            background: #1a1a1a;
          }
          .result-emoji {
            font-size: 40px;
            margin-right: 12px;
          }
          .result-content {
            flex: 1;
          }
          .result-team {
            color: #fff;
            font-weight: 600;
            font-size: 15px;
            margin-bottom: 2px;
          }
          .result-challenge {
            color: #999;
            font-size: 13px;
            margin-bottom: 2px;
          }
          .result-description {
            color: #666;
            font-size: 13px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .no-results {
            color: #666;
            text-align: center;
            padding: 40px 20px;
            font-size: 15px;
          }
          .searching {
            color: #666;
            text-align: center;
            padding: 20px;
            font-size: 14px;
          }
        `}</style>
        <div className="search-overlay">
          <div className="search-header">
            <FontAwesomeIcon
              icon={faArrowLeft}
              className="back-button"
              onClick={handleCloseSearch}
            />
            <div className="search-input-container">
              <FontAwesomeIcon icon={faSearch} style={{ color: '#666', marginRight: '8px' }} />
              <input
                type="text"
                className="search-input"
                placeholder="Search videos"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
              />
              {searchQuery && (
                <FontAwesomeIcon
                  icon={faTimes}
                  className="clear-button"
                  onClick={() => setSearchQuery('')}
                />
              )}
            </div>
          </div>
          <div className="search-results">
            {isSearching && <div className="searching">Searching...</div>}
            {!isSearching && searchQuery.trim().length > 0 && searchResults.length === 0 && (
              <div className="no-results">No results found</div>
            )}
            {searchResults.map((result) => (
              <div
                key={result._id}
                className="search-result-item"
                onClick={() => handleResultClick(result._id)}
              >
                <div className="result-emoji">{result.team.emoji}</div>
                <div className="result-content">
                  <div className="result-team">{result.team.name}</div>
                  <div className="result-challenge">{result.challenge.title}</div>
                  <div className="result-description">{result.note}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="top-navbar">
      <div style={{ width: '16px' }}></div>
      <h2>Following  |   <span>For You</span></h2>
      <div
        onClick={() => setShowSearch(true)}
        onTouchEnd={(e) => {
          e.preventDefault();
          setShowSearch(true);
        }}
        style={{
          cursor: 'pointer',
          padding: '10px',
          margin: '-10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <FontAwesomeIcon
          icon={faSearch}
          className='icon'
        />
      </div>
    </div>
  );
};

export default TopNavbar;
