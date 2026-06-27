import { FriendsScreen, type FriendPerson } from "@/components/games/friends-screen";

/** PREVIEW ONLY — no auth/DB; mock people to judge the friends redesign. */
export const dynamic = "force-static";

const mk = (id: string, name: string, num: number, level: number): FriendPerson => ({
  id,
  name,
  playerNumber: num,
  level,
  avatarSrc: null,
  seed: name,
});

export default function FriendsPreview() {
  return (
    <FriendsScreen
      requests={[mk("r1", "سلطان", 1099, 14), mk("r2", "ناصر", 1120, 9)]}
      friends={[mk("f1", "تركي", 1077, 18), mk("f2", "عبدالله", 1064, 11), mk("f3", "ريان", 1130, 7)]}
    />
  );
}
