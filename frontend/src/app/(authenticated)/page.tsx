'use client';

import DashboardAiToolsRail from '@/components/dashboard/DashboardAiToolsRail';
import DashboardAnalyticsPanel from '@/components/dashboard/DashboardAnalyticsPanel';
import DashboardQuickActions from '@/components/dashboard/DashboardQuickActions';
import DashboardRecentGrid from '@/components/dashboard/DashboardRecentGrid';
import useHomeViewModel from '@/lib/dashboard/useHomeViewModel';

export default function AuthenticatedHomePage() {
  const viewModel = useHomeViewModel();

  if (viewModel.isLoading) {
    return <p className="px-2 py-8 text-sm text-slate-400">Loading workspace...</p>;
  }

  if (!viewModel.profileReady) {
    return (
      <div className="rounded-[1.5rem] border border-amber-400/20 bg-amber-500/10 px-5 py-4 text-sm text-amber-100">
        Your session is no longer active. Refresh the page or sign in again.
      </div>
    );
  }

  return (
    <div className="space-y-14 pb-4">
      <DashboardQuickActions
        actions={viewModel.quickActions}
        busyAction={viewModel.busyAction}
        onQuickAction={viewModel.onQuickAction}
      />

      {viewModel.actionError && (
        <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {viewModel.actionError}
        </div>
      )}

      <DashboardRecentGrid
        cards={viewModel.recents}
        isLoading={viewModel.recentsLoading}
        error={viewModel.recentsError}
      />

      <DashboardAnalyticsPanel
        data={viewModel.analyticsData}
        cta={viewModel.secondaryCta}
      />

      <DashboardAiToolsRail
        tools={viewModel.aiTools}
        exploreHref={viewModel.aiToolsExploreHref}
      />
    </div>
  );
}
