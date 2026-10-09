import { InfoTabPage, infoTabMetadata } from "@/components/climate/info-tab-page";

type Props = { params: Promise<{ slug: string }> };

export function generateMetadata({ params }: Props) {
  return infoTabMetadata("farming", "lga", params.then((p) => p.slug));
}

export default function Page({ params }: Props) {
  return <InfoTabPage tab="farming" kind="lga" placeKey={params.then((p) => p.slug)} />;
}
