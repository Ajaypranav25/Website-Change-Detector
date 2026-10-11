import { endSession, jsonOk } from "@/lib/auth";

export async function POST() {
  await endSession();
  return jsonOk(null);
}
