import ProfileClient from "./profileClient";

export const runtime = "nodejs";

export default function ProfilePage({ params }: { params: { wallet: string } }) {
  return <ProfileClient wallet={params.wallet} />;
}
