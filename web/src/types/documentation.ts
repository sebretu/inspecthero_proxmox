export interface DocSubPhoto {
  id: string;
  url: string;
  storage_path?: string;
  caption?: string;
  created_at?: string;
}

export interface PhotoDocPoint {
  id: string;
  documentation_id: string;
  point_number: number;
  title: string;
  description: string | null;
  x_norm: number; // 0.0 to 1.0 (relative to main image width)
  y_norm: number; // 0.0 to 1.0 (relative to main image height)
  callout_x_norm?: number | null; // optional offset for callout card
  callout_y_norm?: number | null; // optional offset for callout card
  color?: string; // hex color for badge & leader line
  photos: DocSubPhoto[];
  created_at: string;
  updated_at: string;
}

export interface PhotoDocumentation {
  id: string;
  project_id: string | null;
  title: string;
  description: string | null;
  location: string | null;
  author_name: string | null;
  company_name: string | null;
  main_image_url: string;
  main_image_path: string | null;
  main_image_width?: number | null;
  main_image_height?: number | null;
  metadata?: Record<string, any>;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  points?: PhotoDocPoint[];
  projects?: {
    id: string;
    name: string;
    companies?: { name: string } | null;
  } | null;
}
