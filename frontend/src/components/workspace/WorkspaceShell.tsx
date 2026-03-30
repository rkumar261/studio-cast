import WorkspacePromoBanner from '@/components/workspace/WorkspacePromoBanner';
import WorkspaceSearchBar from '@/components/workspace/WorkspaceSearchBar';
import WorkspaceSidebar from '@/components/workspace/WorkspaceSidebar';

export default function WorkspaceShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[var(--workspace-bg)] text-[var(--workspace-text-primary)]">
      <div className="flex min-h-screen">
        <WorkspaceSidebar />

        <div className="min-w-0 flex-1 px-4 py-4 sm:px-6">
          <div className="mx-auto flex max-w-[1700px] flex-col gap-4">
            <WorkspaceSearchBar />
            <div className="workspace-canvas overflow-hidden workspace-section-enter">
              <WorkspacePromoBanner />
              <div className="px-6 py-6 md:px-8">{children}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
