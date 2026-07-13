import { redirect } from "next/navigation";

type Props = { params: Promise<{ id: string }> };

/** Legacy route — editor lives at /editor/[id] */
export default async function LegacyEditorRedirect({ params }: Props) {
  const { id } = await params;
  redirect(`/editor/${id}`);
}
