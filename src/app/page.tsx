import { StaffChiefApp } from "@/components/staff-chief-app";
import { getAppState } from "@/lib/db/repository";

export const dynamic = "force-dynamic";

export default function Home() {
  return <StaffChiefApp initialState={getAppState()} />;
}
