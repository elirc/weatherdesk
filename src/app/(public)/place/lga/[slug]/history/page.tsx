import { InfoTabPage, infoTabMetadata, type RawSearchParams } from "@/components/climate/info-tab-page";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<RawSearchParams> };

export function generateMetadata({ params }: Props) {
  return infoTabMetadata("history", "lga", params.then((p) => p.slug));
}

export default function Page({ params, searchParams }: Props) {
  return <InfoTabPage tab="history" kind="lga" placeKey={params.then((p) => p.slug)} searchParams={searchParams} />;
}
