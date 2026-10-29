import { Editor } from "@/components/editor/Editor";

export default async function EditorPage({ params }: PageProps<"/editor/[id]">) {
  const { id } = await params;
  return <Editor projectId={id} />;
}
