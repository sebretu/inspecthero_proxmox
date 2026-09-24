import { useState, useEffect, useCallback } from 'react';
import { getDatabase } from '../../db/database';

export interface ProjectRow {
  id: string;
  name: string;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
  version: number;
}

export function useProjects() {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const db = await getDatabase();
      const rows = await db.getAllAsync<ProjectRow>(
        'SELECT * FROM projects WHERE deleted_at IS NULL ORDER BY name ASC;'
      );
      setProjects(rows);
    } catch (err: any) {
      console.error('[useProjects] Error loading projects from SQLite:', err);
      setError(err?.message || 'Błąd odczytu projektów z bazy lokalnej');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  return { projects, loading, error, refresh: loadProjects };
}
