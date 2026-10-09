import { InfoTabPage, infoTabMetadata, type RawSearchParams } from "@/components/climate/info-tab-page";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<RawSearchParams> };

export function generateMetadata({ params }: Props) {
  return infoTabMetadata("history", "settlement", params.then((p) => p.id));
}

export default function Page({ params, searchParams }: Props) {
  return <InfoTabPage tab="history" kind="settlement" placeKey={params.then((p) => p.id)} searchParams={searchParams} />;
}
