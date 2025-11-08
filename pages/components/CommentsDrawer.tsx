import React, { useEffect, useState } from "react";
import {
  Drawer,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  DrawerOverlay,
  DrawerContent,
  DrawerCloseButton,
  Input,
  Button,
  VStack,
  Text,
  Flex,
  Box,
  IconButton,
} from "@chakra-ui/react";
import { ArrowUpIcon } from "@chakra-ui/icons";

interface Comment {
  _id: string;
  teamName: string;
  message: string;
  createdAt: string;
}

interface CommentsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  submissionId: string;
  initialCommentCount: number;
}

const CommentsDrawer: React.FC<CommentsDrawerProps> = ({
  isOpen,
  onClose,
  submissionId,
  initialCommentCount,
}) => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const fetchComments = async () => {
    try {
      const response = await fetch(
        `/api/chat/messages?threadId=${submissionId}`
      );
      if (response.ok) {
        const data = await response.json();
        setComments(data.messages);
      }
    } catch (error) {
      console.error("Failed to fetch comments:", error);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchComments();
    }
  }, [isOpen, submissionId]);

  const handlePostComment = async () => {
    if (!newComment.trim() || isLoading) {
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/chat/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: newComment,
          threadId: submissionId,
        }),
      });

      if (response.ok) {
        setNewComment("");
        await fetchComments();
      }
    } catch (error) {
      console.error("Error posting comment:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handlePostComment();
    }
  };

  return (
    <Drawer isOpen={isOpen} placement="bottom" onClose={onClose} size="lg">
      <DrawerOverlay bg="blackAlpha.600" />
      <DrawerContent
        borderTopRadius="20px"
        maxH="80vh"
        bg="white"
      >
        <DrawerHeader
          borderBottomWidth="1px"
          fontSize="md"
          fontWeight="semibold"
          textAlign="center"
        >
          {comments.length > 0 ? `${comments.length} comments` : "No comments yet"}
        </DrawerHeader>
        <DrawerCloseButton />

        <DrawerBody px={4} py={3}>
          <VStack spacing={4} alignItems="stretch">
            {comments.length === 0 ? (
              <Flex
                direction="column"
                alignItems="center"
                justifyContent="center"
                py={10}
                color="gray.400"
              >
                <Text fontSize="sm">Be the first to comment!</Text>
              </Flex>
            ) : (
              comments.map((comment) => (
                <Flex key={comment._id} direction="column" py={2}>
                  <Flex alignItems="flex-start" gap={3}>
                    <Box flex={1}>
                      <Flex alignItems="baseline" gap={2} mb={1}>
                        <Text fontWeight="bold" fontSize="sm">
                          {comment.teamName}
                        </Text>
                        <Text fontSize="xs" color="gray.500">
                          {new Date(comment.createdAt).toLocaleDateString()}
                        </Text>
                      </Flex>
                      <Text fontSize="sm">{comment.message}</Text>
                    </Box>
                  </Flex>
                </Flex>
              ))
            )}
          </VStack>
        </DrawerBody>

        <DrawerFooter borderTopWidth="1px" px={4} py={3}>
          <Flex width="100%" gap={2}>
            <Input
              placeholder="Add a comment..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={isLoading}
              size="md"
              borderRadius="full"
              flex={1}
            />
            <IconButton
              aria-label="Post comment"
              icon={<ArrowUpIcon />}
              onClick={handlePostComment}
              isLoading={isLoading}
              colorScheme="blue"
              borderRadius="full"
              isDisabled={!newComment.trim()}
            />
          </Flex>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
};

export default CommentsDrawer;
