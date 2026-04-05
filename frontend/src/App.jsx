import { useMemo, useState } from 'react';
import {
  AlarmClockCheck,
  ArchiveRestore,
  BrainCircuit,
  FileStack,
  RefreshCcw,
  ShieldAlert,
  Sparkles,
  Wifi,
  WifiOff,
  Loader2,
} from 'lucide-react';
import { TimelinePanel } from './components/TimelinePanel';
import { DevLogPanel } from './components/DevLogPanel';
import { DecisionsPanel } from './components/DecisionsPanel';
import { QueryPanel } from './components/QueryPanel';
import { HandoffModal } from './components/HandoffModal';
import { SnapshotsDrawer } from './components/SnapshotsDrawer';
import { StatusPill } from './components/StatusPill';
import { useDashboardData } from './hooks/useDashboardData';
import {
  countDangerZones,
  countOpenTodos,
  formatRelativeTime,
} from './lib/formatters';

function App() {
  const {
    connectionMode,
    connectionError,
    timeline,
    devlog,
    decisions,
    snapshots,
    todos,
    status,
    queryResult,
    queryPending,
    handoffDocument,
    handoffPending,
    restorePending,
    askDevlog,
    generateHandoff,
    restoreSnapshot,
  } = useDashboardData();
  const [isSnapshotsOpen, setIsSnapshotsOpen] = useState(false);
  const [isHandoffOpen, setIsHandoffOpen] = useState(false);

  // Connection mode display
  const connectionDisplay = useMemo(() => {
    if (connectionMode === 'live') {
      return {
        value: '🔥 Live',
        detail: 'Firestore connected',
        icon: Wifi,
        accent: 'text-moss',
        bgAccent: 'bg-moss/10',
      };
    }
    if (connectionMode === 'connecting') {
      return {
        value: 'Connecting...',
        detail: 'Initializing Firestore',
        icon: Loader2,
        accent: 'text-marine animate-spin',
        bgAccent: 'bg-marine/10',
      };
    }
    if (connectionMode === 'error') {
      return {
        value: 'Error',
        detail: connectionError || 'Connection failed',
        icon: WifiOff,
        accent: 'text-clay',
        bgAccent: 'bg-clay/10',
      };
    }
    return {
      value: 'Unknown',
      detail: 'Check console',
      icon: WifiOff,
      accent: 'text-clay',
      bgAccent: 'bg-clay/10',
    };
  }, [connectionMode, connectionError]);

  const statCards = useMemo(
    () => [
      {
        label: 'Project health',
        value: status?.projectHealth ?? 'unknown',
        icon: ShieldAlert,
        accent: 'text-moss',
        bgAccent: 'bg-moss/10',
      },
      {
        label: 'Open todos',
        value: countOpenTodos(todos),
        icon: AlarmClockCheck,
        accent: 'text-marine',
        bgAccent: 'bg-marine/10',
      },
      {
        label: 'Danger zones',
        value: countDangerZones(status),
        icon: BrainCircuit,
        accent: 'text-clay',
        bgAccent: 'bg-clay/10',
      },
      {
        label: 'Connection',
        value: connectionDisplay.value,
        detail: connectionDisplay.detail,
        icon: connectionDisplay.icon,
        accent: connectionDisplay.accent,
        bgAccent: connectionDisplay.bgAccent,
      },
    ],
    [connectionDisplay, status, todos],
  );

  return (
    <div className="min-h-screen bg-sand text-ink">
      {/* Live Mode Banner */}
      {connectionMode === 'live' && (
        <div className="sticky top-0 z-50 border-b border-moss/20 bg-moss/10 backdrop-blur-sm animate-rise">
          <div className="dashboard-shell py-2">
            <div className="flex items-center justify-center gap-2 text-sm">
              <Wifi className="h-4 w-4 text-moss" />
              <span className="font-medium text-moss">
                🔥 Live Mode Active - Connected to Firestore
              </span>
              <span className="rounded-full bg-moss/20 px-2 py-0.5 text-xs text-moss">
                Real-time updates
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Connecting Banner */}
      {connectionMode === 'connecting' && (
        <div className="sticky top-0 z-50 border-b border-marine/20 bg-marine/10 backdrop-blur-sm">
          <div className="dashboard-shell py-2">
            <div className="flex items-center justify-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 text-marine animate-spin" />
              <span className="font-medium text-marine">
                Connecting to Firestore...
              </span>
              <span className="rounded-full bg-marine/20 px-2 py-0.5 text-xs text-marine">
                Please wait
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Error Banner */}
      {connectionMode === 'error' && (
        <div className="sticky top-0 z-50 border-b border-clay/20 bg-clay/10 backdrop-blur-sm">
          <div className="dashboard-shell py-2">
            <div className="flex items-center justify-center gap-2 text-sm">
              <WifiOff className="h-4 w-4 text-clay" />
              <span className="font-medium text-clay">
                Connection Error
              </span>
              {connectionError && (
                <span className="rounded-full bg-clay/20 px-2 py-0.5 text-xs text-clay truncate max-w-xs">
                  {connectionError}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="dashboard-shell">
        <header className="panel relative overflow-hidden">
          <div className="absolute -right-12 top-0 h-44 w-44 rounded-full bg-gold/20 blur-3xl" />
          <div className="absolute left-1/3 top-1/2 h-32 w-32 rounded-full bg-marine/10 blur-3xl" />
          <div className="relative flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl space-y-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/75 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-ink/70">
                <FileStack className="h-4 w-4 text-clay" />
                DevLog AI demo dashboard
              </div>
              <div className="space-y-3">
                <h1 className="font-display text-4xl leading-tight text-ink sm:text-5xl">
                  One screen for the whole build story.
                </h1>
                <p className="max-w-2xl text-base leading-7 text-ink/70 sm:text-lg">
                  Follow code changes as they land, see the living project
                  document update in real time, and surface decisions,
                  snapshots, and backend answers without leaving the demo flow.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <StatusPill label={status?.projectHealth ?? 'unknown'} />
                <span className="rounded-full border border-ink/10 bg-white/70 px-4 py-2 text-sm text-ink/70">
                  Last sync{' '}
                  {formatRelativeTime(
                    status?.lastUpdated ?? devlog?.lastUpdated ?? null,
                  )}
                </span>
                <span className="rounded-full border border-ink/10 bg-white/70 px-4 py-2 text-sm text-ink/70">
                  Timeline entries {timeline.length}
                </span>
              </div>
            </div>

            <div className="grid w-full gap-3 sm:grid-cols-2 lg:w-[420px]">
              {statCards.map((card) => {
                const Icon = card.icon;

                return (
                  <div
                    key={card.label}
                    className="rounded-3xl border border-white/70 bg-white/80 p-4 shadow-panel backdrop-blur animate-rise"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-ink/60">{card.label}</p>
                        <p className="mt-2 text-2xl font-semibold capitalize text-ink">
                          {card.value}
                        </p>
                        {card.detail && (
                          <p className="mt-1 text-xs text-ink/50 truncate">
                            {card.detail}
                          </p>
                        )}
                      </div>
                      <span
                        className={`rounded-2xl ${card.bgAccent || 'bg-ink/5'} p-3 ${card.accent}`}
                      >
                        <Icon className="h-5 w-5" />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="relative mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                setIsHandoffOpen(true);
                void generateHandoff();
              }}
              className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-medium text-white transition hover:bg-ink/90"
            >
              <RefreshCcw className="h-4 w-4" />
              Generate handoff
            </button>
            <button
              type="button"
              onClick={() => setIsSnapshotsOpen(true)}
              className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white/85 px-5 py-3 text-sm font-medium text-ink transition hover:border-ink/20 hover:bg-white"
            >
              <ArchiveRestore className="h-4 w-4" />
              Open snapshots
            </button>
          </div>
        </header>

        <main className="mt-6 grid gap-6 xl:grid-cols-[1.08fr_1fr]">
          <div className="space-y-6">
            <TimelinePanel entries={timeline} />
            <QueryPanel
              result={queryResult}
              isLoading={queryPending}
              onSubmit={askDevlog}
            />
          </div>

          <div className="space-y-6">
            <DevLogPanel devlog={devlog} todos={todos} />
            <DecisionsPanel decisions={decisions} />
          </div>
        </main>
      </div>

      <SnapshotsDrawer
        isOpen={isSnapshotsOpen}
        snapshots={snapshots}
        isRestoring={restorePending}
        onClose={() => setIsSnapshotsOpen(false)}
        onRestore={restoreSnapshot}
      />

      <HandoffModal
        isOpen={isHandoffOpen}
        isLoading={handoffPending}
        handoffDocument={handoffDocument}
        onClose={() => setIsHandoffOpen(false)}
      />
    </div>
  );
}

export default App;
