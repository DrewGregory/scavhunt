import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTv, faSearch, faTimes } from '@fortawesome/free-solid-svg-icons';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  Input,
  VStack,
  Text,
  Flex,
  Box,
  useDisclosure,
} from '@chakra-ui/react';

const TopNavbar = ({ onVideoSelect }) => {
  const { isOpen, onOpen, onClose } = useDisclosure();
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
    onClose();
    setSearchQuery('');
    setSearchResults([]);
    if (onVideoSelect) {
      onVideoSelect(submissionId);
    }
  };

  return (
    <>
      <div className="top-navbar">
        <FontAwesomeIcon icon={faTv} className='icon'/>
        <h2>Following  |   <span>For You</span></h2>
        <FontAwesomeIcon icon={faSearch} className='icon' onClick={onOpen} style={{ cursor: 'pointer' }}/>
      </div>

      <Modal isOpen={isOpen} onClose={onClose} size="xl">
        <ModalOverlay />
        <ModalContent bg="white" mt={4}>
          <ModalHeader>Search Videos</ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            <Input
              placeholder="Search by team name, challenge, or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              size="lg"
              mb={4}
              autoFocus
            />
            {isSearching && <Text color="gray.500">Searching...</Text>}
            <VStack spacing={2} alignItems="stretch" maxH="60vh" overflowY="auto">
              {searchResults.length === 0 && searchQuery.trim().length > 0 && !isSearching && (
                <Text color="gray.500">No results found</Text>
              )}
              {searchResults.map((result) => (
                <Box
                  key={result._id}
                  p={3}
                  borderWidth="1px"
                  borderRadius="md"
                  cursor="pointer"
                  _hover={{ bg: 'gray.50' }}
                  onClick={() => handleResultClick(result._id)}
                >
                  <Flex direction="column">
                    <Text fontWeight="bold" fontSize="sm">
                      {result.team.emoji} {result.team.name}
                    </Text>
                    <Text fontSize="sm" color="gray.600" noOfLines={1}>
                      {result.challenge.title}
                    </Text>
                    <Text fontSize="xs" color="gray.500" noOfLines={2} mt={1}>
                      {result.note}
                    </Text>
                  </Flex>
                </Box>
              ))}
            </VStack>
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
};

export default TopNavbar;
