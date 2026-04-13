import { redirect } from 'next/navigation';

export default async function RecordingDetailRedirect({
  params,
}: {
  params: Promise<{ id?: string }>;
}) {
  const resolvedParams = await params;

  if (!resolvedParams.id) {
    redirect('/recordings');
  }

  redirect(`/projects/${resolvedParams.id}`);
}
