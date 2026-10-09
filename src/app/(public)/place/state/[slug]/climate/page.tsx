import { InfoTabPage, infoTabMetadata } from "@/components/climate/info-tab-page";

type Props = { params: Promise<{ slug: string }> };

export function generateMetadata({ params }: Props) {
  return infoTabMetadata("climate", "state", params.then((p) => p.slug));
}

export default function Page({ params }: Props) {
  return <InfoTabPage tab="climate" kind="state" placeKey={params.then((p) => p.slug)} />;
}
