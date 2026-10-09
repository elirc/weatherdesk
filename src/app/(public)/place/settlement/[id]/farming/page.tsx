import { InfoTabPage, infoTabMetadata } from "@/components/climate/info-tab-page";

type Props = { params: Promise<{ id: string }> };

export function generateMetadata({ params }: Props) {
  return infoTabMetadata("farming", "settlement", params.then((p) => p.id));
}

export default function Page({ params }: Props) {
  return <InfoTabPage tab="farming" kind="settlement" placeKey={params.then((p) => p.id)} />;
}
