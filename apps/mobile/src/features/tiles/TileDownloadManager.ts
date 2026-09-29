import { TileCacheService, TileCacheProgress, ProjectCacheProgress } from './TileCacheService';

export interface DownloadManagerState {
  isDownloading: boolean;
  type: 'project' | 'plan' | null;
  targetId: string | null;
  targetName: string | null;
  totalItems: number;
  completedItems: number;
  currentPlanName: string;
  planProgress: TileCacheProgress | null;
  error?: string | null;
}

type Listener = (state: DownloadManagerState) => void;

class TileDownloadManagerClass {
  private state: DownloadManagerState = {
    isDownloading: false,
    type: null,
    targetId: null,
    targetName: null,
    totalItems: 0,
    completedItems: 0,
    currentPlanName: '',
    planProgress: null,
    error: null,
  };

  private listeners: Set<Listener> = new Set();
  private abortController: AbortController | null = null;

  public getState(): DownloadManagerState {
    return { ...this.state };
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const currentState = this.getState();
    this.listeners.forEach((fn) => {
      try {
        fn(currentState);
      } catch (err) {
        console.warn('[TileDownloadManager] Listener error:', err);
      }
    });
  }

  /**
   * Start downloading all plans for an entire project in the background
   */
  public async startProjectDownload(projectId: string, projectName: string): Promise<boolean> {
    if (this.state.isDownloading) {
      console.warn('[TileDownloadManager] A download is already in progress');
      return false;
    }

    this.state = {
      isDownloading: true,
      type: 'project',
      targetId: projectId,
      targetName: projectName,
      totalItems: 1,
      completedItems: 0,
      currentPlanName: 'Inicjalizacja...',
      planProgress: null,
      error: null,
    };
    this.notify();

    try {
      const res = await TileCacheService.prefetchProjectPlans(projectId, (pProgress: ProjectCacheProgress) => {
        this.state.totalItems = pProgress.totalPlans;
        this.state.completedItems = pProgress.completedPlans;
        this.state.currentPlanName = pProgress.currentPlanName;
        this.state.planProgress = pProgress.planProgress;
        this.notify();
      });

      this.state.isDownloading = false;
      this.state.type = null;
      this.state.targetId = null;
      this.state.targetName = null;
      this.notify();
      return res.success;
    } catch (err: any) {
      this.state.isDownloading = false;
      this.state.error = err?.message || 'Błąd pobierania projektu';
      this.notify();
      return false;
    }
  }

  /**
   * Start downloading tiles for a single plan in the background
   */
  public async startPlanDownload(planId: string, planName: string, maxZoom: number = 5): Promise<boolean> {
    if (this.state.isDownloading) {
      console.warn('[TileDownloadManager] A download is already in progress');
      return false;
    }

    this.state = {
      isDownloading: true,
      type: 'plan',
      targetId: planId,
      targetName: planName,
      totalItems: 1,
      completedItems: 0,
      currentPlanName: planName,
      planProgress: null,
      error: null,
    };
    this.notify();

    try {
      const res = await TileCacheService.prefetchPlanTiles(planId, maxZoom, (pProg: TileCacheProgress) => {
        this.state.planProgress = pProg;
        this.notify();
      });

      this.state.isDownloading = false;
      this.state.type = null;
      this.state.targetId = null;
      this.state.targetName = null;
      this.notify();
      return res.success;
    } catch (err: any) {
      this.state.isDownloading = false;
      this.state.error = err?.message || 'Błąd pobierania planu';
      this.notify();
      return false;
    }
  }
}

export const TileDownloadManager = new TileDownloadManagerClass();
