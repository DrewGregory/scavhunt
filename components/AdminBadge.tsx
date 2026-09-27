import { Tag } from "@chakra-ui/react";

/** Small label for staff/admin users in player-facing UI. */
export default function AdminBadge() {
  return (
    <Tag
      size="sm"
      colorScheme="purple"
      variant="solid"
      borderRadius="full"
      fontWeight="semibold"
      flexShrink={0}
    >
      Admin
    </Tag>
  );
}
